#!/usr/bin/env python3
"""Sprint10 supplement to the existing S09B operator. No action on import.
prepare: local files only; activate/cleanup require separately recorded approval.
"""
import ast
import copy
import datetime as dt
import hashlib
import json
import os
import re
import sys
import io
import termios
from pathlib import Path

ISSUE='https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-'
ROLE_PREVIEW=ISSUE+'7120084354'
IAM=ISSUE+'7087182041'
SCOPE=ISSUE+'7118635015'
DEPLOYMENT=ISSUE+'7088378232'
HISTORICAL='https://github.com/shirrie01/bizgenie-api/issues/257#issuecomment-7025438945'
DIGEST='sha256:6f6e51a3217a965cd9c756e62592991eef9e12da752a4f2e8b48f6ad945e9a3f'
REF=re.compile(r'https://github\.com/shirrie01/bizgenie-api/(issues|pull)/\d+#issuecomment-\d+')
ROOT=Path.home()/'bizgenie-r1'
BASE_OPERATOR=ROOT/'bg017c-s09b.py'
PROFILE=ROOT/'bg017c-sprint10-profile.private.json'
CANDIDATE=ROOT/'bg017c-sprint10-binding.private.json'
EVIDENCE=ROOT/'bg017c-sprint10-evidence.private.json'
PREVIOUS_SUPPLEMENT_SHA256='373e2c9f818454acc1fce32ef868c4ecf3929fcf3d86fc91929517863adfee61'
MIGRATION_RECEIPT=ROOT/'bg017c-sprint10b-migration.private.json'
_STAGE='local.start'

def stage(value):
    global _STAGE
    _STAGE=value


def terminal_prompt(prompt,hidden=False):
    # /dev/tty is non-seekable: NEVER open r+ or use getpass fallback.
    before=_STAGE
    stage('terminal.open')
    reader=writer=None
    old=None
    try:
        reader=os.fdopen(os.open('/dev/tty',os.O_RDONLY|os.O_NOCTTY),'r',encoding='utf-8')
        writer=os.fdopen(os.open('/dev/tty',os.O_WRONLY|os.O_NOCTTY),'w',encoding='utf-8')
        need(reader.isatty() and writer.isatty(),'TERMINAL_NOT_AVAILABLE')
        if hidden:
            stage('terminal.echo_disable')
            old=termios.tcgetattr(reader.fileno())
            desired=copy.deepcopy(old)
            desired[3] &= ~(termios.ECHO|termios.ECHONL)
            termios.tcsetattr(reader.fileno(),termios.TCSAFLUSH,desired)
            actual=termios.tcgetattr(reader.fileno())
            need(not actual[3] & (termios.ECHO|termios.ECHONL),
                 'TERMINAL_ECHO_SUPPRESSION_FAILED')
        stage('terminal.hidden_read' if hidden else 'terminal.ordinary_read')
        writer.write(prompt); writer.flush()
        value=reader.readline(65537)
        need(value.endswith('\n') and len(value)<=65536,'TERMINAL_INPUT_INCOMPLETE_OR_TOO_LONG')
        value=value.strip()
    finally:
        try:
            if old is not None and reader is not None:
                # Discard any unread secret input before restoring echo.
                try:
                    try:
                        termios.tcflush(reader.fileno(),termios.TCIFLUSH)
                    finally:
                        termios.tcsetattr(reader.fileno(),termios.TCSANOW,old)
                    need(termios.tcgetattr(reader.fileno())==old,'TERMINAL_RESTORE_FAILED')
                    if writer is not None:
                        writer.write('\n'); writer.flush()
                except BaseException:
                    stage('terminal.restore'); raise
        finally:
            if reader is not None: reader.close()
            if writer is not None: writer.close()
    stage(before)
    return value


def safe_error_record(error):
    # Only fixed codes appearing in reviewed need()/RuntimeError() literals may escape.
    allowed=set()
    for file in (Path(__file__),BASE_OPERATOR):
        try:
            for node in ast.walk(ast.parse(file.read_text())):
                if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):
                    args=node.args
                    arg=args[1] if node.func.id=='need' and len(args)>1 else (
                        args[0] if node.func.id=='RuntimeError' and args else None)
                    if isinstance(arg,ast.Constant) and isinstance(arg.value,str) and re.fullmatch(r'[A-Z][A-Z0-9_]{1,100}',arg.value):
                        allowed.add(arg.value)
        except Exception:
            pass
    code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'OPERATOR_OPERATION_FAILED'
    if isinstance(error,KeyboardInterrupt): category='INTERRUPTED'
    elif isinstance(error,io.UnsupportedOperation): category='UNSUPPORTED_STREAM_OPERATION'
    elif isinstance(error,termios.error): category='TERMINAL_CONTROL_FAILED'
    elif isinstance(error,OSError): category='LOCAL_OS_ERROR'
    elif isinstance(error,ValueError): category='LOCAL_VALUE_ERROR'
    elif isinstance(error,RuntimeError): category='SAFE_GUARD_REJECTION'
    else: category='LOCAL_EXCEPTION'
    return {'status':'HOLD','stage':_STAGE,'code':code,'category':category,
            'automaticRetry':False,
            'next':'Preserve private state. Do not retry activation automatically.'}


def need(ok,code):
    if not ok:
        raise RuntimeError(code)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def exact_json(obj):
    return json.dumps(obj,separators=(',',':')).encode('utf-8')


def private(path):
    path=Path(path)
    st=path.lstat()
    need(path.is_file() and not path.is_symlink() and st.st_uid==os.getuid()
         and st.st_mode & 0o077 == 0,'PRIVATE_FILE_PERMISSIONS')
    return json.loads(path.read_bytes())


def write_new(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f:
        f.write(data); f.flush(); os.fsync(f.fileno())


def replace_private(path,obj):
    # Only locally generated Sprint10 evidence is replaced, with an exclusive backup.
    original=private(path)
    backup=path.with_name(path.name+'.before-'+os.urandom(6).hex())
    write_new(backup,exact_json(original))
    tmp=path.with_name(path.name+'.new-'+os.urandom(6).hex())
    write_new(tmp,exact_json(obj))
    os.replace(tmp,path)


def make_binding(cfg,r2,now=None):
    need(cfg.get('bindingFormat')=='r2-release','ACCEPTED_R2_BINDING_REQUIRED')
    e=r2['environment']
    b={
        'founderId':e['BG_BRIDGE_FOUNDER_AUTH_USER_ID'],
        'tenantId':e['BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID'],
        'projectId':e['BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID'],
        'brandId':e['BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID'],
        'campaignId':cfg['acceptedCampaignId'],
        'approvedRole':'postgres','privateIamEvidenceRef':IAM,
        # Comparison-target approval only; activation overwrites this after final approval.
        'approvalRef':ROLE_PREVIEW,'bindingEvidenceRef':SCOPE,
        'expiresAt':((now or dt.datetime.now(dt.timezone.utc))+
                     dt.timedelta(minutes=29)).isoformat().replace('+00:00','Z'),
        'preview':{'platform':'linkedin','placement':'feed','format':'image'}}
    uuid=re.compile(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}')
    need(all(isinstance(b[k],str) and uuid.fullmatch(b[k])
             for k in ('founderId','campaignId')),'ACCEPTED_IDENTIFIER_FORMAT')
    need(all(isinstance(b[k],str) and 0<len(b[k])<=128 and
             not re.search(r'\s|[\x00-\x1f]',b[k])
             for k in ('tenantId','projectId','brandId')),'ACCEPTED_SCOPE_FORMAT')
    return b


def response_contract(body):
    need(isinstance(body,dict) and body.get('poolOrigin')=='injected_application_pool'
         and body.get('provenanceBasis')=='source_wiring_not_dynamic_attestation'
         and body.get('catalogOnly') is True,'DIAGNOSTIC_PROVENANCE_CONTRACT_MISMATCH')
    need(isinstance(body.get('role'),dict) and
         isinstance(body.get('onboardingPreflight'),dict),'DIAGNOSTIC_OUTPUT_SHAPE_INVALID')


def load_operator():
    stage('local.operator_load')
    source=BASE_OPERATOR.read_text()
    # Retain S09B activation implementation. Add only a pre-output provenance guard.
    if 'DIAGNOSTIC_PROVENANCE_CONTRACT_MISMATCH' not in source:
        marker='    role=body.get("role",{})'
        need(source.count(marker)==1,'BASE_OPERATOR_PATCH_ANCHOR_MISMATCH')
        source=source.replace(marker,'    s10_response_contract(body)\n'+marker)
    tree=ast.parse(source,str(BASE_OPERATOR))
    nodes=[]
    for index,node in enumerate(tree.body):
        if isinstance(node,(ast.Import,ast.ImportFrom,ast.Assign,ast.FunctionDef)):
            nodes.append(node)
        elif isinstance(node,ast.Try) and index==len(tree.body)-1:
            # Never run the original CLI dispatcher during loading.
            continue
        else:
            need(False,'UNRECOGNISED_BASE_OPERATOR_STRUCTURE')
    ns={'__name__':'sprint09b_definitions','s10_response_contract':response_contract}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(BASE_OPERATOR),'exec'),ns)
    need((ns.get('P'),ns.get('R'),ns.get('S'),ns.get('DIGEST'),ns.get('TAG'))==
         ('bizgenie-backend','europe-west1','bizgenie-api-staging',DIGEST,'bg017c-sprint09b'),
         'BASE_OPERATOR_TARGET_MISMATCH')
    need(set(ns['TABLES'])=={
        'campaigns','campaign_content_items','campaign_platform_variants',
        'campaign_revisions','campaign_approval_events','campaign_schedule_entries',
        'campaign_preview_evidence','campaign_preview_render_receipts',
        'campaign_command_receipts','campaign_preview_profiles','tenants','projects',
        'tenant_memberships','brand_brains','workspace_onboarding_profiles'},
        'BASE_OPERATOR_RESPONSE_ALLOWLIST_MISMATCH')
    ns['tty']=terminal_prompt
    return ns


def prepare():
    load_operator()  # definitions only, no cloud calls
    need(not any(p.exists() or p.is_symlink() for p in (PROFILE,CANDIDATE,EVIDENCE)),
         'EXISTING_SPRINT10_PREPARATION_PRESERVED')
    cfg=private(ROOT/'founder-funding.private.json')
    r2path=Path(cfg['bindingFile'])
    r2=private(r2path)
    need(sha(r2path.read_bytes())==cfg['bindingSha256'],'ACCEPTED_R2_HASH_MISMATCH')
    b=make_binding(cfg,r2)
    write_new(CANDIDATE,exact_json(b))
    write_new(EVIDENCE,exact_json({
        'inputBindingFile':str(CANDIDATE),'inputBindingSha256':sha(CANDIDATE.read_bytes()),
        'roleApprovalRef':ROLE_PREVIEW,'previewApprovalRef':ROLE_PREVIEW,
        'historicalRoleEvidenceRef':HISTORICAL,
        'historicalRoleIsCurrentPoolProof':False,
        'scopeEvidenceRef':SCOPE,'privateIamEvidenceRef':IAM,
        'reviewedDeploymentRef':DEPLOYMENT,'finalActivationApprovalRef':None,
        'roleBoundary':'Expected postgres comparison; historical BYPASSRLS caveat requires review',
        'provenance':'Founder supplied / ChatGPT recovered; not independently read by this executor',
        'currentApplicationPoolProof':'PENDING_DIAGNOSTIC'}))
    write_new(PROFILE,exact_json({'baseOperatorSha256':sha(BASE_OPERATOR.read_bytes()),
                                'supplementSha256':sha(Path(__file__).read_bytes())}))
    print(json.dumps({'status':'PRIVATE_BINDING_PREPARED_NOT_ACTIVATED',
                      'bindingFile':str(CANDIDATE),'evidenceFile':str(EVIDENCE)}))


def check_profile(*, migration_in_progress=False):
    stage('local.integrity_profile')
    p=private(PROFILE)
    need(p['baseOperatorSha256']==sha(BASE_OPERATOR.read_bytes()),'BASE_OPERATOR_CHANGED_SINCE_PREPARATION')
    need(p['supplementSha256']==sha(Path(__file__).read_bytes()),'SUPPLEMENT_CHANGED_SINCE_PREPARATION')
    if MIGRATION_RECEIPT.exists() or MIGRATION_RECEIPT.is_symlink():
        receipt=private(MIGRATION_RECEIPT)
        need(receipt.get('status')=='COMPLETE' or
             migration_in_progress and receipt.get('status')=='INTENT',
             'MIGRATION_INCOMPLETE_REQUIRES_READBACK')
        need(receipt.get('correctedSupplementSha256')==p['supplementSha256'] and
             receipt.get('baseOperatorSha256')==p['baseOperatorSha256'],
             'MIGRATION_RECEIPT_HASH_MISMATCH')


def bind_runtime_evidence(ns,binding):
    """Called by existing save(), AFTER expiry refresh, BEFORE deploy intent."""
    evidence=private(EVIDENCE)
    need(binding.get('approvedRole')=='postgres' and binding.get('preview')==
         {'platform':'linkedin','placement':'feed','format':'image'},'APPROVED_TARGET_CHANGED')
    ref=binding['approvalRef']
    need(isinstance(ref,str) and REF.fullmatch(ref) and ref!=ROLE_PREVIEW,
         'SEPARATE_FINAL_ACTIVATION_APPROVAL_REQUIRED')
    canonical=exact_json(binding)
    target=ns['W']/'binding.private.json'
    write_new(target,canonical)
    evidence.update({'finalActivationApprovalRef':ref,'bindingFile':str(target),
                     'bindingSha256':sha(canonical),
                     'hashBasis':'Exact UTF-8 deployed environment string, no trailing newline',
                     'currentApplicationPoolProof':'PENDING_DIAGNOSTIC'})
    replace_private(EVIDENCE,evidence)
    write_new(ns['W']/'binding-evidence.private.json',exact_json(evidence))


def check_deployed_binding(ns):
    """Fail before invocation, including if deployment succeeded but readback failed."""
    state=private(ns['W']/'state.private.json')
    e=private(ns['W']/'binding-evidence.private.json')
    local=(ns['W']/'binding.private.json').read_bytes()
    need(sha(local)==e['bindingSha256'],'PRIVATE_FINAL_BINDING_HASH_MISMATCH')
    external=private(EVIDENCE)
    need(external['bindingSha256']==e['bindingSha256'] and
         external['finalActivationApprovalRef']==e['finalActivationApprovalRef'],
         'PRIVATE_EVIDENCE_RECORD_MISMATCH')
    r=ns['j']('run','revisions','describe',state['revision'],'--region='+ns['R'])
    env=ns['envmap'](r['spec'])
    deployed=env['BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING'].get('value')
    need(isinstance(deployed,str) and sha(deployed.encode('utf-8'))==e['bindingSha256'],
         'DEPLOYED_FINAL_BINDING_HASH_MISMATCH')
    need(env['BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED'].get('value')=='true',
         'DIAGNOSTIC_NOT_ENABLED')
    binding=json.loads(deployed)
    need(binding['approvalRef']==e['finalActivationApprovalRef'], 'DEPLOYED_APPROVAL_MISMATCH')
    ns['expiry_valid'](binding)


def activate(ns):
    need(not ns['W'].exists(),'EXISTING_ACTIVATION_ATTEMPT_PRESERVED')
    evidence=private(EVIDENCE)
    need(sha(CANDIDATE.read_bytes())==evidence['inputBindingSha256'],'PRIVATE_CANDIDATE_CHANGED')
    original_tty=ns['tty']; original_save=ns['save']; original_event=ns['event']
    def tty(prompt,hidden=False):
        if prompt=='Path to EXISTING approved private diagnostic binding: ':
            return str(CANDIDATE)
        answer=original_tty(prompt,hidden)
        if prompt=='Genuine founder approval URL for THIS activation and cleanup: ':
            need(isinstance(answer,str) and REF.fullmatch(answer) and answer!=ROLE_PREVIEW,
                 'SEPARATE_FINAL_ACTIVATION_APPROVAL_REQUIRED')
        return answer
    def save(path,obj):
        if path==ns['W']/'binding.private.json':
            return bind_runtime_evidence(ns,obj)
        return original_save(path,obj)
    def event(action,status):
        if action=='invoke-once' and status=='INTENT':
            check_deployed_binding(ns)
        return original_event(action,status)
    ns['tty']=tty; ns['save']=save; ns['event']=event
    stage('activation.operator')
    ns['activate']()
    evidence=private(EVIDENCE)
    captured=ns['W']/'evidence.redacted.json'
    need(captured.is_file(),'SANITISED_EVIDENCE_FILE_MISSING')
    evidence.update({'currentApplicationPoolProof':'CAPTURED_REQUIRES_INDEPENDENT_ACCEPTANCE',
                     'sanitisedEvidenceSha256':sha(captured.read_bytes())})
    replace_private(EVIDENCE,evidence)
    replace_private(ns['W']/'binding-evidence.private.json',evidence)
    print(json.dumps({'status':'FINAL_BINDING_HASH_VERIFIED',
                      'bindingSha256':evidence['bindingSha256'],
                      'acceptance':'REQUIRES_INDEPENDENT_REVIEW'}))


def secret_refs(spec):
    out=set()
    for c in spec.get('containers',[]):
        for env in c.get('env',[]):
            name=env.get('valueFrom',{}).get('secretKeyRef',{}).get('name')
            if name: out.add(name.split('/')[-1])
    for v in spec.get('volumes',[]):
        name=v.get('secret',{}).get('secretName')
        if name: out.add(name.split('/')[-1])
    return out


def stable_routes(ns,current,state):
    need(ns['normal'](current)==state['normal'],
         'NORMAL_TRAFFIC_CHANGED_STOP_NO_OVERWRITE')


def restoration_document(ns,current,baseline,state):
    # Freeze resolved revision names; never carry latestRevision=True forward.
    stable_routes(ns,current,state)
    meta=current['metadata']
    need(isinstance(meta.get('resourceVersion'),str) and meta['resourceVersion'],
         'RESTORATION_CONCURRENCY_TOKEN_MISSING')
    allowed=('name','namespace','resourceVersion','labels','annotations')
    metadata={k:copy.deepcopy(meta[k]) for k in allowed if k in meta}
    for key in ('run.googleapis.com/urls','run.googleapis.com/operation-id',
                'run.googleapis.com/ingress-status','serving.knative.dev/creator',
                'serving.knative.dev/lastModifier'):
        metadata.get('annotations',{}).pop(key,None)
    spec=copy.deepcopy(current['spec'])
    template=copy.deepcopy(baseline['spec']['template'])
    template['metadata']={k:v for k,v in template.get('metadata',{}).items()
                          if k in ('labels','annotations')}
    template['metadata']['name']=ns['S']+'-bg017c-s09b-restore-'+state['owner']
    template['spec']['containers'][0]['image']=state['image']
    spec['template']=template
    spec['traffic']=[{'revisionName':n,'percent':p} for n,p in state['normal'].items()]
    spec['traffic'] += [{'revisionName':n,'tag':t,'percent':0}
                       for t,n in ns['tags'](current).items()]
    need(not secret_refs(template['spec']).intersection(state['secrets']),
         'ORIGINAL_TEMPLATE_REFERENCES_TEMPORARY_SECRET')
    return {'apiVersion':'serving.knative.dev/v1','kind':'Service',
            'metadata':metadata,'spec':spec}


def cleanup(ns):
    j=ns['j']; mutate=ns['mutate']; W=ns['W']; R=ns['R']; S=ns['S']; TAG=ns['TAG']
    state=private(W/'state.private.json')
    owner=state['owner']; revision=state['revision']
    need(re.fullmatch(r'[a-f0-9]{16}',owner) and
         revision==S+'-bg017c-s09b-'+owner,'RECOVERY_IDENTITY_INVALID')
    need(state['secrets']==[ns['CA_SECRET'],ns['DB_SECRET']],'RECOVERY_SECRET_NAMES_INVALID')
    baseline=private(W/'baseline-service.private.json')
    baseline_iam=private(W/'baseline-iam.private.json')
    current=j('run','services','describe',S,'--region='+R)
    stable_routes(ns,current,state)  # first gate: NO routing mutation on changed normal traffic
    ct=ns['tags'](current)
    expected=dict(ct)
    if TAG in ct:
        need(ct[TAG]==revision,'OWNED_TAG_REVISION_MISMATCH')
        # Do not overwrite any other tag, including legitimate new tags.
        latest=j('run','services','describe',S,'--region='+R)
        stable_routes(ns,latest,state)
        need(ns['tags'](latest)==ct,'TAG_CHANGE_DURING_CLEANUP')
        mutate('remove-owned-tag',['run','services','update-traffic',S,'--region='+R,
                                  '--remove-tags='+TAG])
        expected.pop(TAG)
    current=j('run','services','describe',S,'--region='+R)
    stable_routes(ns,current,state)
    need(ns['tags'](current)==expected,'OTHER_TAG_CHANGE_STOP')

    if secret_refs(current['spec']['template']['spec']).intersection(state['secrets']):
        need(current['spec']['template']['metadata']['name']==revision,
             'INTERVENING_SERVICE_TEMPLATE_STOP')
        # Own template must still be the exact recorded diagnostic binding.
        e=private(W/'binding-evidence.private.json')
        env=ns['envmap'](current['spec']['template']['spec'])
        raw=env.get('BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING',{}).get('value')
        need(isinstance(raw,str) and sha(raw.encode())==e['bindingSha256'],
             'OWNED_TEMPLATE_BINDING_CHANGED')
        doc=restoration_document(ns,current,baseline,state)
        path=W/'restore-service.private.json'
        if path.exists():
            old=private(path)
            # A previous attempt may have changed resourceVersion; never silently resubmit it.
            need(old==doc,'RESTORATION_ATTEMPT_REQUIRES_READBACK')
            need(False,'RESTORATION_ATTEMPT_REQUIRES_READBACK')
        latest=j('run','services','describe',S,'--region='+R)
        stable_routes(ns,latest,state)
        need(latest['metadata'].get('resourceVersion')==doc['metadata']['resourceVersion'] and
             ns['tags'](latest)==expected,'SERVICE_CHANGED_BEFORE_RESTORATION')
        write_new(path,exact_json(doc))
        # Intent contains the deterministic restoration name before submitting replace.
        restore_name=doc['spec']['template']['metadata']['name']
        mutate('restore-template:'+restore_name,
               ['run','services','replace',str(path),'--region='+R])
        current=j('run','services','describe',S,'--region='+R)
        stable_routes(ns,current,state)
        need(ns['tags'](current)==expected,'TAG_CHANGE_AFTER_RESTORATION')
        need(current['spec']['template']['metadata']['name']==restore_name and
             current['spec']['template']['spec']==doc['spec']['template']['spec'],
             'RESTORED_TEMPLATE_NOT_VERIFIED')
        need(current['status'].get('latestReadyRevisionName')==restore_name,
             'RESTORATION_REVISION_NOT_READY')
        need(ns['normal'](current).get(restore_name,0)==0,
             'RESTORATION_REVISION_RECEIVED_NORMAL_TRAFFIC')
        need(ns['policy'](j('run','services','get-iam-policy',S,'--region='+R))==
             ns['policy'](baseline_iam),'SERVICE_IAM_CHANGED_STOP')
        ns['event']('verify-template-restoration','DONE')

    need(not secret_refs(current['spec']['template']['spec']).intersection(state['secrets']),
         'SERVICE_TEMPLATE_STILL_REFERENCES_TEMPORARY_SECRETS')
    stable_routes(ns,j('run','services','describe',S,'--region='+R),state)
    revisions=j('run','revisions','list','--region='+R)
    if any(x.get('metadata',{}).get('name')==revision for x in revisions):
        actual=j('run','revisions','describe',revision,'--region='+R)
        need(actual['status']['imageDigest']==state['image'],'OWNED_REVISION_IMAGE_MISMATCH')
        env=ns['envmap'](actual['spec'])
        raw=env.get('BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING',{}).get('value')
        need(isinstance(raw,str) and sha(raw.encode())==
             private(W/'binding-evidence.private.json')['bindingSha256'],
             'OWNED_REVISION_BINDING_MISMATCH')
        current=j('run','services','describe',S,'--region='+R)
        stable_routes(ns,current,state)
        need(not any(x.get('revisionName')==revision and
                     (x.get('percent',0)>0 or x.get('tag'))
                     for x in current['status']['traffic']),'OWNED_REVISION_STILL_ROUTED')
        mutate('delete-revision:'+revision,['run','revisions','delete',revision,'--region='+R])

    # All accessible regions, both service templates and retained revisions.
    # Unknown inventory or denied read means HOLD, never secret deletion.
    regions=j('run','regions','list'); need(isinstance(regions,list) and regions,'REGION_INVENTORY_EMPTY')
    locations=[]
    for region in regions:
        name=region.get('locationId') or region.get('metadata',{}).get('name')
        need(isinstance(name,str) and re.fullmatch(r'[a-z]+-[a-z0-9]+[0-9]',name),
             'REGION_INVENTORY_UNRECOGNISED')
        locations.append(name)
    need(R in locations,'TARGET_REGION_MISSING_FROM_INVENTORY')
    for location in locations:
        for svc in j('run','services','list','--region='+location):
            full=j('run','services','describe',svc['metadata']['name'],'--region='+location)
            need(not secret_refs(full['spec']['template']['spec']).intersection(state['secrets']),
                 'TEMPORARY_SECRET_REFERENCED_BY_SERVICE_TEMPLATE')
        for rev in j('run','revisions','list','--region='+location):
            full=j('run','revisions','describe',rev['metadata']['name'],'--region='+location)
            need(not secret_refs(full['spec']).intersection(state['secrets']),
                 'TEMPORARY_SECRET_REFERENCED_BY_REVISION')
    existing={x['name'].split('/')[-1] for x in j('secrets','list')}
    for name in state['secrets']:
        if name not in existing: continue
        resource=j('secrets','describe',name)
        need(resource.get('labels',{}).get('bg017c-owner')==owner,'TEMPORARY_SECRET_OWNERSHIP_MISMATCH')
        p=j('secrets','get-iam-policy',name)
        member='serviceAccount:'+state['serviceAccount']
        bindings=[b for b in p.get('bindings',[]) if b.get('role')=='roles/secretmanager.secretAccessor'
                  and member in b.get('members',[])]
        need(not any(b.get('condition') for b in bindings),'UNEXPECTED_CONDITIONAL_SECRET_GRANT')
        if bindings:
            mutate('remove-grant:'+name,['secrets','remove-iam-policy-binding',name,
                   '--member='+member,'--role=roles/secretmanager.secretAccessor'])
        p=j('secrets','get-iam-policy',name)
        need(not any(b.get('role')=='roles/secretmanager.secretAccessor' and member in b.get('members',[])
                     for b in p.get('bindings',[])),'SECRET_GRANT_REMOVAL_NOT_VERIFIED')
        stable_routes(ns,j('run','services','describe',S,'--region='+R),state)
        mutate('delete-secret:'+name,['secrets','delete',name])
    need(not set(state['secrets']).intersection({x['name'].split('/')[-1] for x in j('secrets','list')}),
         'SECRET_DELETION_NOT_VERIFIED')
    current=j('run','services','describe',S,'--region='+R)
    stable_routes(ns,current,state)
    need(ns['tags'](current)==expected,'TAG_CHANGE_AT_CLEANUP_COMPLETION')
    ns['event']('sprint10-cleanup','DONE')
    print(json.dumps({'status':'OWNED_TEMPORARY_RESOURCES_REMOVED',
                      'normalTrafficUnchanged':True,'databaseRollbackRequired':False,
                      'restorationRevisionMayRemainAtZeroNormalTraffic':True}))


def migrate_profile(previous):
    """Local-only migration. Never loads S09B definitions or calls cloud commands."""
    stage('migration.verify_previous')
    old=private(PROFILE)
    previous=Path(previous)
    st=previous.lstat()
    need(previous.is_file() and not previous.is_symlink() and st.st_uid==os.getuid()
         and st.st_mode & 0o077 == 0,'PREVIOUS_SUPPLEMENT_FILE_PERMISSIONS')
    need(old['supplementSha256']==PREVIOUS_SUPPLEMENT_SHA256 and
         sha(previous.read_bytes())==PREVIOUS_SUPPLEMENT_SHA256,
         'PREVIOUS_SUPPLEMENT_HASH_MISMATCH')
    need(old['baseOperatorSha256']==sha(BASE_OPERATOR.read_bytes()),
         'BASE_OPERATOR_CHANGED_SINCE_PREPARATION')
    need(not (ROOT/'bg017c-s09b').exists() and not (ROOT/'bg017c-s09b').is_symlink(),
         'ACTIVATION_STATE_EXISTS_MIGRATION_REFUSED')
    original_candidate=CANDIDATE.read_bytes(); original_evidence=EVIDENCE.read_bytes()
    private(CANDIDATE); e=private(EVIDENCE)
    need(sha(original_candidate)==e['inputBindingSha256'],'PRIVATE_CANDIDATE_CHANGED')
    need(e.get('finalActivationApprovalRef') is None,'ACTIVATION_EVIDENCE_EXISTS_MIGRATION_REFUSED')
    backup=PROFILE.with_name(PROFILE.name+'.before-sprint10b')
    need(not backup.exists() and not backup.is_symlink() and
         not MIGRATION_RECEIPT.exists() and not MIGRATION_RECEIPT.is_symlink(),
         'MIGRATION_ALREADY_STARTED_REQUIRES_READBACK')
    updated=dict(old)
    updated['supplementSha256']=sha(Path(__file__).read_bytes())
    need(updated['supplementSha256']!=PREVIOUS_SUPPLEMENT_SHA256,'CORRECTED_SUPPLEMENT_REQUIRED')
    stage('migration.preserve_evidence')
    old_bytes=PROFILE.read_bytes()
    write_new(backup,old_bytes)
    receipt={'status':'INTENT','previousSupplementSha256':PREVIOUS_SUPPLEMENT_SHA256,
             'correctedSupplementSha256':updated['supplementSha256'],
             'baseOperatorSha256':old['baseOperatorSha256'],
             'originalProfileBackup':str(backup),'originalProfileSha256':sha(old_bytes),
             'candidateSha256':sha(original_candidate),'evidenceSha256':sha(original_evidence),
             'cloudActions':False,'activationExecuted':False}
    write_new(MIGRATION_RECEIPT,exact_json(receipt))
    stage('migration.update_profile')
    tmp=PROFILE.with_name(PROFILE.name+'.sprint10b-new')
    write_new(tmp,exact_json(updated))
    need(PROFILE.read_bytes()==old_bytes and
         CANDIDATE.read_bytes()==original_candidate and EVIDENCE.read_bytes()==original_evidence,
         'PRIVATE_PREPARATION_CHANGED_DURING_MIGRATION')
    os.replace(tmp,PROFILE)
    check_profile(migration_in_progress=True)
    need(CANDIDATE.read_bytes()==original_candidate and EVIDENCE.read_bytes()==original_evidence,
         'PRIVATE_PREPARATION_CHANGED_DURING_MIGRATION')
    stage('migration.complete')
    receipt['status']='COMPLETE'
    replace_private(MIGRATION_RECEIPT,receipt)
    check_profile()
    print(json.dumps({'status':'LOCAL_INTEGRITY_MIGRATION_PASS',
                      'previousHashesVerified':True,'originalProfilePreserved':True,
                      'candidateAndEvidenceUnchanged':True,'sprint09bUnchanged':True,
                      'activationExecuted':False,'freshExecutionAuthorisationRequired':True}))


def main():
    need(len(sys.argv)>=2,'MODE_REQUIRED')
    mode=sys.argv[1]
    if mode=='migrate-profile':
        need(len(sys.argv)==3,'PREVIOUS_SUPPLEMENT_PATH_REQUIRED')
        migrate_profile(sys.argv[2]); return
    need(len(sys.argv)==2 and mode in ('prepare','activate','cleanup'),'MODE_REQUIRED')
    if mode=='prepare':
        stage('local.prepare')
        prepare(); return
    check_profile()
    ns=load_operator()
    stage('activation.preconditions' if mode=='activate' else 'cleanup.operator')
    activate(ns) if mode=='activate' else cleanup(ns)


if __name__=='__main__':
    try:
        main()
    except (Exception,KeyboardInterrupt) as error:
        print(json.dumps(safe_error_record(error)))
        sys.exit(1)
