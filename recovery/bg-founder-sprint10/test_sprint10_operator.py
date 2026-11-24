import copy
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('s10',Path(__file__).with_name('sprint10_operator.py'))
s=importlib.util.module_from_spec(spec); spec.loader.exec_module(s)

A='00000000-0000-4000-8000-000000000001'
B='00000000-0000-4000-8000-000000000002'
OWNER='0123456789abcdef'
SERVICE='bizgenie-api-staging'
SECRET_NAMES=['bizgenie-staging-bg017c-ca-s09b','bizgenie-staging-bg017c-db-s09b']
FINAL=s.ISSUE+'9999999999'

def fixtures():
    cfg={'bindingFormat':'r2-release','acceptedCampaignId':B}
    r2={'environment':{'BG_BRIDGE_FOUNDER_AUTH_USER_ID':A,
         'BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID':'tenant-synthetic',
         'BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID':'project-synthetic',
         'BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID':'brand-synthetic'}}
    return cfg,r2

def normal(v):
    return {x['revisionName']:x['percent'] for x in v['status']['traffic'] if x.get('percent',0)>0}

def tags(v):
    return {x['tag']:x['revisionName'] for x in v['status']['traffic'] if x.get('tag')}

def service():
    return {'metadata':{'name':SERVICE,'namespace':'synthetic','resourceVersion':'rv1',
            'annotations':{'run.googleapis.com/ingress':'all','run.googleapis.com/urls':'computed'}},
            'spec':{'template':{'metadata':{'name':SERVICE+'-00031-ruv','annotations':{'autoscaling.knative.dev/maxScale':'2'}},
             'spec':{'serviceAccountName':'synthetic@example.invalid','timeoutSeconds':300,
                     'containers':[{'image':'original:tag','env':[{'name':'SAFE_SETTING','value':'preserved'},
                      {'name':'BRAND_BRAIN_DATABASE_URL','valueFrom':{'secretKeyRef':{'name':'original-staging-secret','key':'latest'}}}]}]}},
             'traffic':[{'latestRevision':True,'percent':100}]},
            'status':{'traffic':[{'revisionName':SERVICE+'-00029-wtc','percent':100},
                {'revisionName':SERVICE+'-00030-pob','tag':'accepted-existing','percent':0}]}}

def state():
    return {'owner':OWNER,'revision':SERVICE+'-bg017c-s09b-'+OWNER,
            'normal':{SERVICE+'-00029-wtc':100},'tags':{'accepted-existing':SERVICE+'-00030-pob'},
            'secrets':SECRET_NAMES,'image':'example.invalid/test@'+s.DIGEST,
            'serviceAccount':'synthetic@example.invalid'}

def refs_spec(name):
    return {'containers':[{'env':[{'name':'DATABASE','valueFrom':{'secretKeyRef':{'name':name,'key':'1'}}}]}]}

class Tests(unittest.TestCase):
    def test_binding_uses_r2_and_exact_approved_targets(self):
        cfg,r2=fixtures(); now=dt.datetime(2026,11,24,tzinfo=dt.timezone.utc)
        b=s.make_binding(cfg,r2,now)
        self.assertEqual(b['campaignId'],B)
        self.assertEqual(b['approvedRole'],'postgres')
        self.assertEqual(b['preview'],{'platform':'linkedin','placement':'feed','format':'image'})
        self.assertEqual(b['privateIamEvidenceRef'],s.IAM)
        self.assertEqual(b['expiresAt'],'2026-11-24T00:29:00Z')
        self.assertEqual(set(b),{'founderId','tenantId','projectId','brandId','campaignId','approvedRole',
                              'privateIamEvidenceRef','approvalRef','bindingEvidenceRef','expiresAt','preview'})

    def test_missing_scope_does_not_invent(self):
        cfg,r2=fixtures(); del r2['environment']['BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID']
        with self.assertRaises(KeyError): s.make_binding(cfg,r2)

    def test_changed_normal_traffic_blocks_before_cleanup_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            w=Path(temp); s.write_new(w/'state.private.json',s.exact_json(state()))
            baseline=service(); current=service(); current['status']['traffic'][0]['percent']=99
            s.write_new(w/'baseline-service.private.json',s.exact_json(baseline))
            s.write_new(w/'baseline-iam.private.json',b'{"bindings":[]}')
            calls=[]
            ns={'W':w,'R':'europe-west1','S':SERVICE,'TAG':'bg017c-sprint09b',
                'CA_SECRET':SECRET_NAMES[0],'DB_SECRET':SECRET_NAMES[1],
                'j':lambda *a: current,'normal':normal,
                'mutate':lambda *a:calls.append(a)}
            with self.assertRaisesRegex(RuntimeError,'NORMAL_TRAFFIC_CHANGED'):
                s.cleanup(ns)
            self.assertEqual(calls,[])

    def test_restoration_has_zero_new_normal_traffic_and_original_spec(self):
        baseline=service(); current=service(); current['spec']['template']['spec']=refs_spec(SECRET_NAMES[1])
        ns={'normal':normal,'tags':tags,'S':SERVICE}
        d=s.restoration_document(ns,current,baseline,state())
        self.assertFalse(s.secret_refs(d['spec']['template']['spec']).intersection(SECRET_NAMES))
        self.assertEqual(d['spec']['template']['spec']['containers'][0]['image'],state()['image'])
        self.assertEqual(d['spec']['template']['spec']['serviceAccountName'],'synthetic@example.invalid')
        self.assertEqual(d['metadata']['resourceVersion'],'rv1')
        self.assertNotIn('run.googleapis.com/urls',d['metadata']['annotations'])
        self.assertEqual(d['metadata']['annotations']['run.googleapis.com/ingress'],'all')
        self.assertTrue(all(not x.get('latestRevision') for x in d['spec']['traffic']))
        self.assertEqual(sum(x.get('percent',0) for x in d['spec']['traffic']),100)
        self.assertFalse(any(x['revisionName']==d['spec']['template']['metadata']['name']
                             for x in d['spec']['traffic']))

    def test_restoration_requires_concurrency_token(self):
        b=service(); c=service(); del c['metadata']['resourceVersion']
        with self.assertRaisesRegex(RuntimeError,'CONCURRENCY_TOKEN_MISSING'):
            s.restoration_document({'normal':normal,'tags':tags,'S':SERVICE},c,b,state())

    def test_restore_does_not_mutate_snapshots(self):
        b=service(); c=service(); oldb=copy.deepcopy(b); oldc=copy.deepcopy(c)
        s.restoration_document({'normal':normal,'tags':tags,'S':SERVICE},c,b,state())
        self.assertEqual(b,oldb); self.assertEqual(c,oldc)

    def test_secret_reference_checks_both_env_and_volume(self):
        spec=refs_spec(SECRET_NAMES[1]); spec['volumes']=[{'secret':{'secretName':SECRET_NAMES[0]}}]
        self.assertEqual(s.secret_refs(spec),set(SECRET_NAMES))

    def test_response_provenance_requires_exact_literals(self):
        body={'poolOrigin':'injected_application_pool','provenanceBasis':'source_wiring_not_dynamic_attestation',
              'catalogOnly':True,'role':{},'onboardingPreflight':{}}
        s.response_contract(body)
        for field in ('poolOrigin','provenanceBasis','catalogOnly'):
            wrong=dict(body); wrong[field]='synthetic-private-value'
            with self.assertRaisesRegex(RuntimeError,'DIAGNOSTIC_PROVENANCE'):
                s.response_contract(wrong)

    def test_binding_hash_is_exact_refreshed_environment_string(self):
        cfg,r2=fixtures(); binding=s.make_binding(cfg,r2); binding['approvalRef']=FINAL
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); w=root/'work'; w.mkdir(); e=root/'evidence.json'
            s.write_new(e,s.exact_json({'inputBindingSha256':'input','roleApprovalRef':s.ROLE_PREVIEW}))
            with patch.object(s,'EVIDENCE',e):
                s.bind_runtime_evidence({'W':w},binding)
            raw=(w/'binding.private.json').read_bytes(); evidence=s.private(w/'binding-evidence.private.json')
            self.assertEqual(raw,s.exact_json(binding)); self.assertFalse(raw.endswith(b'\n'))
            self.assertEqual(evidence['bindingSha256'],s.sha(raw))
            self.assertEqual(s.private(e)['bindingSha256'],s.sha(raw))
            self.assertEqual(evidence['finalActivationApprovalRef'],FINAL)
            self.assertEqual(evidence['roleApprovalRef'],s.ROLE_PREVIEW)

    def test_comparison_approval_cannot_authorize_activation(self):
        cfg,r2=fixtures(); binding=s.make_binding(cfg,r2)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); e=root/'evidence.json'; s.write_new(e,b'{}')
            with patch.object(s,'EVIDENCE',e):
                with self.assertRaisesRegex(RuntimeError,'SEPARATE_FINAL_ACTIVATION'):
                    s.bind_runtime_evidence({'W':root},binding)
            self.assertFalse((root/'binding.private.json').exists())

    def test_deployed_hash_mismatch_denies_before_invocation(self):
        with tempfile.TemporaryDirectory() as temp:
            w=Path(temp); e=w/'outer.json'; binding={'approvalRef':FINAL,'expiresAt':'synthetic'}
            raw=s.exact_json(binding); evidence={'bindingSha256':s.sha(raw),'finalActivationApprovalRef':FINAL}
            for p,data in [(w/'state.private.json',s.exact_json(state())),
                           (w/'binding-evidence.private.json',s.exact_json(evidence)),
                           (w/'binding.private.json',raw),(e,s.exact_json(evidence))]: s.write_new(p,data)
            env={'BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING':{'value':raw.decode()+' '}}
            ns={'W':w,'R':'europe-west1','j':lambda *a:{'spec':{}},'envmap':lambda spec:env}
            with patch.object(s,'EVIDENCE',e):
                with self.assertRaisesRegex(RuntimeError,'DEPLOYED_FINAL_BINDING_HASH'):
                    s.check_deployed_binding(ns)

    def test_runtime_role_is_only_a_comparison_target(self):
        cfg,r2=fixtures(); binding=s.make_binding(cfg,r2)
        self.assertNotIn('bypassRls',binding)
        self.assertEqual(binding['approvedRole'],'postgres')

    def test_cli_import_performs_no_cloud_or_activation(self):
        import subprocess
        with patch.object(subprocess,'run',side_effect=AssertionError('unexpected execution')):
            x=importlib.util.module_from_spec(spec); spec.loader.exec_module(x)


class RecoveryTests(unittest.TestCase):
    def exercise(self,kind):
        import contextlib,io
        with tempfile.TemporaryDirectory() as temp:
            w=Path(temp); st=state(); baseline=service(); current=service()
            binding={'approvalRef':FINAL,'expiresAt':'expired-cleanup-still-allowed'}
            bindtext=s.exact_json(binding).decode()
            diag={'metadata':{'name':st['revision']},'spec':{
                'serviceAccountName':st['serviceAccount'],
                'containers':[{'image':st['image'],'env':[
                    {'name':'BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING','value':bindtext},
                    {'name':'BRAND_BRAIN_DATABASE_URL','valueFrom':{'secretKeyRef':{'name':SECRET_NAMES[1],'key':'1'}}}]}],
                'volumes':[{'name':'ca','secret':{'secretName':SECRET_NAMES[0]}}]},
                'status':{'imageDigest':st['image']}}
            revisions={}
            if kind!='partial-create':
                current['spec']['template']={'metadata':{'name':st['revision']},'spec':copy.deepcopy(diag['spec'])}
                current['status']['traffic'].append({'revisionName':st['revision'],'tag':'bg017c-sprint09b','percent':0})
                revisions[st['revision']]=diag
            # A legitimate later tag must survive cleanup/restoration unchanged.
            current['status']['traffic'].append({'revisionName':SERVICE+'-00030-pob','tag':'legitimate-new-tag','percent':0})
            for p,obj in [(w/'state.private.json',st),(w/'baseline-service.private.json',baseline),
                          (w/'baseline-iam.private.json',{'bindings':[]}),
                          (w/'binding-evidence.private.json',{'bindingSha256':s.sha(bindtext.encode())})]:
                s.write_new(p,s.exact_json(obj))
            remaining=set(SECRET_NAMES); grants=set(SECRET_NAMES); calls=[]
            def j(*args):
                if args[:3]==('run','services','describe'): return copy.deepcopy(current)
                if args[:3]==('run','services','get-iam-policy'): return {'bindings':[]}
                if args[:3]==('run','services','list'): return [{'metadata':{'name':SERVICE}}]
                if args[:3]==('run','regions','list'):
                    if kind=='inventory-denied': raise RuntimeError('OPERATOR_COMMAND_FAILED')
                    return [{'locationId':'europe-west1'}]
                if args[:3]==('run','revisions','list'):
                    output=[{'metadata':{'name':name}} for name in revisions]
                    if kind=='foreign-reference': output.append({'metadata':{'name':'foreign-retained'}})
                    return output
                if args[:3]==('run','revisions','describe'):
                    if args[3]=='foreign-retained': return {'spec':refs_spec(SECRET_NAMES[1])}
                    return copy.deepcopy(revisions[args[3]])
                if args[:2]==('secrets','list'): return [{'name':'projects/synthetic/secrets/'+x} for x in remaining]
                if args[:2]==('secrets','describe'): return {'labels':{'bg017c-owner':OWNER}}
                if args[:2]==('secrets','get-iam-policy'):
                    return {'bindings':[{'role':'roles/secretmanager.secretAccessor',
                        'members':['serviceAccount:'+st['serviceAccount']]}] if args[2] in grants else []}
                raise AssertionError(args)
            def mutate(action,args):
                calls.append((action,list(args)))
                if action=='remove-owned-tag':
                    current['status']['traffic']=[x for x in current['status']['traffic'] if x.get('tag')!='bg017c-sprint09b']
                    if kind=='normal-change-after-tag': current['status']['traffic'][0]['percent']=99
                elif action.startswith('restore-template:'):
                    doc=json.loads(Path(args[3]).read_bytes())
                    name=doc['spec']['template']['metadata']['name']
                    current['spec']=doc['spec']
                    current['status']['latestReadyRevisionName']=name
                    revisions[name]={'metadata':{'name':name},'spec':copy.deepcopy(doc['spec']['template']['spec']),
                                     'status':{'imageDigest':st['image']}}
                elif action.startswith('delete-revision:'): revisions.pop(args[3])
                elif action.startswith('remove-grant:'): grants.discard(args[2])
                elif action.startswith('delete-secret:'): remaining.discard(args[2])
                else: raise AssertionError((action,args))
            ns={'W':w,'R':'europe-west1','S':SERVICE,'TAG':'bg017c-sprint09b',
                'CA_SECRET':SECRET_NAMES[0],'DB_SECRET':SECRET_NAMES[1],
                'j':j,'mutate':mutate,'normal':normal,'tags':tags,
                'envmap':lambda spec:{x['name']:x for x in spec['containers'][0].get('env',[])},
                'policy':lambda p:{k:v for k,v in p.items() if k!='etag'},'event':lambda *a:None}
            error=None
            with contextlib.redirect_stdout(io.StringIO()) as out:
                try: s.cleanup(ns)
                except RuntimeError as e: error=str(e)
            return calls,current,remaining,grants,error,out.getvalue()

    def test_cleanup_recovers_deployed_revision_without_deployment_success_file(self):
        calls,current,remaining,grants,error,out=self.exercise('deployed')
        self.assertIsNone(error); self.assertEqual(remaining,set()); self.assertEqual(grants,set())
        self.assertTrue(any(a.startswith('restore-template:') for a,_ in calls))
        self.assertEqual(normal(current),state()['normal'])
        self.assertIn('legitimate-new-tag',tags(current))
        self.assertNotIn('bg017c-sprint09b',tags(current))
        self.assertFalse(s.secret_refs(current['spec']['template']['spec']).intersection(SECRET_NAMES))
        self.assertTrue(all(not any(x.startswith('--to-revisions') or x.startswith('--set-tags') or
                                       x=='--clear-tags' for x in args) for _,args in calls))
        self.assertNotIn('synthetic@example.invalid',out)

    def test_partial_secret_creation_before_deploy_needs_no_binding_or_revision(self):
        calls,current,remaining,grants,error,out=self.exercise('partial-create')
        self.assertIsNone(error); self.assertEqual(remaining,set())
        self.assertFalse(any(a.startswith('restore-template:') or a.startswith('delete-revision:') for a,_ in calls))

    def test_normal_change_after_tag_removal_stops_all_resource_cleanup(self):
        calls,current,remaining,grants,error,out=self.exercise('normal-change-after-tag')
        self.assertEqual(error,'NORMAL_TRAFFIC_CHANGED_STOP_NO_OVERWRITE')
        self.assertEqual([x[0] for x in calls],['remove-owned-tag'])
        self.assertEqual(remaining,set(SECRET_NAMES))

    def test_inventory_denial_preserves_secrets_and_grants(self):
        calls,current,remaining,grants,error,out=self.exercise('inventory-denied')
        self.assertEqual(error,'OPERATOR_COMMAND_FAILED')
        self.assertEqual(remaining,set(SECRET_NAMES)); self.assertEqual(grants,set(SECRET_NAMES))
        self.assertFalse(any(a.startswith('remove-grant:') or a.startswith('delete-secret:') for a,_ in calls))

    def test_foreign_retained_revision_blocks_secret_cleanup(self):
        calls,current,remaining,grants,error,out=self.exercise('foreign-reference')
        self.assertEqual(error,'TEMPORARY_SECRET_REFERENCED_BY_REVISION')
        self.assertEqual(remaining,set(SECRET_NAMES)); self.assertEqual(grants,set(SECRET_NAMES))

if __name__=='__main__': unittest.main()
