#!/usr/bin/env python3
"""BG-RELEASE08 E4 — turn the EXPORTED API Cloud Run service into the scanner-sidecar revision spec. Offline: reads a YAML file, writes a YAML file, applies NOTHING.
Usage:  gcloud run services describe bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --format=export > svc.yaml
        python3 a2-scanner-patch.py svc.yaml a2-service.yaml --api-image API_REF --clamav-image CLAMAV_REF --suffix a2s1 --tag a2-scanner [--env NAME=VALUE ...]   (only the allowlisted MEDIA_* settings; there is no --remove)
Review the output, then (only after the E4 approval and with the operator): gcloud run services replace a2-service.yaml --project=bizgenie-backend --region=europe-west1
The new revision is created with NO traffic (explicitly named, tagged, 0%); every existing traffic entry is preserved. Exits non-zero (and writes nothing) if any safety check fails."""
import argparse, re, sys, copy
import yaml
SERVICE = "bizgenie-api-staging"
CLAM_RE = re.compile(r"^europe-west1-docker\.pkg\.dev/bizgenie-backend/cloud-run-source-deploy/clamav@sha256:[a-f0-9]{64}$")
API_RE = re.compile(r"^europe-west1-docker\.pkg\.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-api@sha256:[a-f0-9]{64}$")
FORBIDDEN_ENV = {"MEDIA_INTAKE_ALLOW_UNSCANNED", "MEDIA_INTAKE_STRUCTURAL_INSPECTION"}
SCANNER_ENV = {"MALWARE_SCANNER": "clamd", "MALWARE_SCANNER_HOST": "127.0.0.1", "MALWARE_SCANNER_PORT": "3310", "MALWARE_SCANNER_MAX_SIGNATURE_AGE_HOURS": "72"}
CLAMD_ENV = {"CLAMD_CONF_StreamMaxLength": "33M", "CLAMD_CONF_MaxFileSize": "33M", "CLAMD_CONF_MaxScanSize": "64M", "CLAMD_CONF_AlertExceedsMax": "yes", "CLAMD_CONF_TCPSocket": "3310", "CLAMD_CONF_TCPAddr": "127.0.0.1", "CLAMD_CONF_MaxThreads": "4", "CLAMAV_NO_FRESHCLAMD": "false"}
CLAM_RES = {"cpu": "1", "memory": "3Gi"}
D4 = "I confirm I own, or am licensed to use, this file for marketing this brand on BizGenie, and that it contains no third-party material I do not have permission to use."
ALLOWED_ENV = {  # the ONLY configuration changes this tool will write, with the only values accepted
    "MEDIA_STORAGE_ENABLED": lambda v: v == "true", "MEDIA_INTAKE_ENABLED": lambda v: v == "true",
    "MEDIA_RIGHTS_POLICY_VERSION": lambda v: v == "fonzo-staging-rights.v1", "MEDIA_RIGHTS_POLICY_STATEMENT": lambda v: v == D4,
    "MEDIA_STORAGE_BUCKET": lambda v: re.match(r"^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", v) is not None and not v.startswith("goog")}
def die(msg): print("REFUSED: " + msg, file=sys.stderr); sys.exit(1)
def cpu(v): v = str(v); return float(v[:-1]) / 1000 if v.endswith("m") else float(v)
def gib(v):
    v = str(v); m = re.match(r"^(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?$", v)
    if not m: die("unreadable memory limit " + v)
    return float(m.group(1)) * {"Ki": 1 / 1048576, "Mi": 1 / 1024, "Gi": 1, "K": 1e3 / 2**30, "M": 1e6 / 2**30, "G": 1e9 / 2**30, None: 1 / 2**30}[m.group(2)]
def structural_check(before, after, rev, a):
    """Only the approved changes may differ between the exported service and the patched one; anything else aborts and nothing is written."""
    b, c = copy.deepcopy(before), copy.deepcopy(after)
    for d in (b, c):
        d["spec"]["template"].get("metadata", {}).pop("annotations", None); d["spec"]["template"].get("metadata", {}).pop("name", None)
    bc, cc = b["spec"]["template"]["spec"]["containers"], c["spec"]["template"]["spec"]["containers"]
    if len(cc) != 2 or cc[1].get("name") != "clamav": die("structural check: containers are not [api, clamav]")
    benv = {e["name"]: e for e in bc[0].get("env", [])}; cenv = {e["name"]: e for e in cc[0].get("env", [])}
    for n, e in benv.items():
        if n not in cenv or (cenv[n] != e and n not in ALLOWED_ENV and n not in SCANNER_ENV): die("structural check: existing env %s was altered or removed" % n)
    for n in cenv:
        if n not in benv and n not in ALLOWED_ENV and n not in SCANNER_ENV: die("structural check: unexpected new env %s" % n)
    for d, i in ((b, bc), (c, cc)): i[0].pop("env", None); i[0].pop("image", None); i[0].pop("name", None)
    cc.pop(1)
    if b["spec"]["template"]["spec"] != c["spec"]["template"]["spec"]: die("structural check: the service account, resources, probes, ports, volumes or other runtime settings changed")
    bt = {k: v for k, v in b["spec"].items() if k != "traffic"}; ct = {k: v for k, v in c["spec"].items() if k != "traffic"}
    if bt != ct: die("structural check: spec outside traffic changed")
    if after["spec"]["traffic"][:len(before["spec"]["traffic"])] != before["spec"]["traffic"] or len(after["spec"]["traffic"]) != len(before["spec"]["traffic"]) + 1: die("structural check: existing traffic entries changed")
    ba = before["spec"]["template"].get("metadata", {}).get("annotations", {}); ca = after["spec"]["template"]["metadata"]["annotations"]
    allowed = {"run.googleapis.com/container-dependencies", "run.googleapis.com/cpu-throttling", "run.googleapis.com/execution-environment", "autoscaling.knative.dev/minScale", "autoscaling.knative.dev/maxScale"}
    for k in set(ba) | set(ca):
        if ba.get(k) != ca.get(k) and k not in allowed: die("structural check: annotation %s changed" % k)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("--api-image", required=True); ap.add_argument("--clamav-image", required=True)
    ap.add_argument("--suffix", required=True); ap.add_argument("--tag", required=True); ap.add_argument("--env", action="append", default=[]);     ap.add_argument("--min-instances", type=int, default=1); ap.add_argument("--max-instances", type=int, default=2); a = ap.parse_args()
    if not (1 <= a.min_instances <= 1 and 1 <= a.max_instances <= 2): die("min instances must be exactly 1 and max at most 2 (cost and always-on scanner)")
    if not API_RE.match(a.api_image) or not CLAM_RE.match(a.clamav_image): die("images must be digest-pinned references in the existing cloud-run-source-deploy repository (clamav@sha256 / bizgenie-api@sha256)")
    if not re.match(r"^[a-z][a-z0-9]{1,15}$", a.suffix) or not re.match(r"^[a-z][a-z0-9-]{1,40}$", a.tag): die("bad suffix or tag")
    doc = yaml.safe_load(open(a.src)); out = copy.deepcopy(doc)
    if doc.get("kind") != "Service" or doc["metadata"]["name"] != SERVICE: die("not the " + SERVICE + " service export")
    tmpl = out["spec"]["template"]; spec = tmpl["spec"]; cs = spec["containers"]
    if len(cs) != 1: die("expected exactly one existing container (already patched?)")
    traffic = out["spec"].get("traffic") or []
    if not traffic or any(t.get("latestRevision") for t in traffic): die("traffic uses latestRevision or is empty: a replace would shift live traffic")
    if sum(t.get("percent", 0) for t in traffic) != 100: die("existing traffic does not sum to 100")
    if any(t.get("tag") == a.tag for t in traffic): die("tag already exists")
    api = cs[0]; api["name"] = "api"; api["image"] = a.api_image
    env = {e["name"]: e for e in api.get("env", [])}
    if any(n in env for n in FORBIDDEN_ENV): die("the unscanned/structural-only flags are present: remove them in a separate reviewed change, never enable them")
    for kv in a.env:
        k, sep, v = kv.partition("=")
        if not sep or k not in ALLOWED_ENV or not ALLOWED_ENV[k](v): die("env setting %s is not on the approved E4 allowlist or its value is not the approved one (name only shown)" % k)
        if k in env and env[k].get("valueFrom"): die("refusing to overwrite a secret-backed variable")
        env[k] = {"name": k, "value": v}
    for k, v in SCANNER_ENV.items(): env[k] = {"name": k, "value": v}
    api["env"] = list(env.values())
    clam = {"name": "clamav", "image": a.clamav_image, "env": [{"name": k, "value": v} for k, v in CLAMD_ENV.items()], "resources": {"limits": dict(CLAM_RES)},
            "startupProbe": {"tcpSocket": {"port": 3310}, "timeoutSeconds": 5, "periodSeconds": 10, "failureThreshold": 30},
            "livenessProbe": {"tcpSocket": {"port": 3310}, "timeoutSeconds": 5, "periodSeconds": 30, "failureThreshold": 3}}
    cs.append(clam)
    ann = tmpl.setdefault("metadata", {}).setdefault("annotations", {})
    ann.update({"run.googleapis.com/container-dependencies": '{"api":["clamav"]}', "run.googleapis.com/cpu-throttling": "false", "run.googleapis.com/execution-environment": "gen2",
                "autoscaling.knative.dev/minScale": str(a.min_instances), "autoscaling.knative.dev/maxScale": str(a.max_instances)})
    rev = SERVICE + "-" + a.suffix; tmpl["metadata"]["name"] = rev
    traffic.append({"revisionName": rev, "percent": 0, "tag": a.tag}); out["spec"]["traffic"] = traffic
    structural_check(doc, out, rev, a)
    yaml.safe_dump(out, open(a.dst, "w"), sort_keys=False)
    vcpu = sum(cpu(c.get("resources", {}).get("limits", {}).get("cpu", "1")) for c in cs); mem = sum(gib(c.get("resources", {}).get("limits", {}).get("memory", "512Mi")) for c in cs)
    secs = 30 * 86400 * a.min_instances; usd = secs * (vcpu * 0.000018 + mem * 0.000002)
    print("wrote %s; new revision %s tagged %s at 0%% traffic; existing traffic untouched (%d entries)" % (a.dst, rev, a.tag, len(traffic) - 1))
    print("instance resources: %.2f vCPU, %.2f GiB (api + clamav), min %d / max %d instances, CPU always allocated" % (vcpu, mem, a.min_instances, a.max_instances))
    print("INDICATIVE always-on cost for min-instances only (UNVERIFIED list prices $0.000018/vCPU-s, $0.000002/GiB-s; USD->GBP 0.79 assumed): about GBP %.0f/month = GBP %.2f/day" % (usd * 0.79, usd * 0.79 / 30))
main()
