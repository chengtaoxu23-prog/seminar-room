from pathlib import Path
import json,re,os,tempfile
tokens=(Path(__file__).parent.parent/'tokens.css').read_text(encoding='utf-8')
v=dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{3,6})',tokens))
pairs=[('primary','text-primary','surface-base'),('secondary','text-secondary','surface-base'),('muted','text-muted','surface-base'),('muted-canvas','text-muted','surface-canvas'),('accent-button','text-on-accent','accent')]+[(n,'status-'+n,'status-'+n+'-bg') for n in ['success','warning','error','info']]
def luminance(h):
 if len(h)==4: h='#'+''.join(c*2 for c in h[1:])
 values=[int(h[i:i+2],16)/255 for i in [1,3,5]]
 return sum(w*(a/12.92 if a<=0.04045 else ((a+0.055)/1.055)**2.4) for w,a in zip([.2126,.7152,.0722],values))
out=[]
for name,fg,bg in pairs:
 a,b=luminance(v[fg]),luminance(v[bg]);ratio=(max(a,b)+.05)/(min(a,b)+.05)
 out.append(dict(name=name,foreground=v[fg],background=v[bg],ratio=round(ratio,2),threshold=4.5,passAAForNormalText=ratio>=4.5))
output=Path(os.environ.get('SEMINAR_DESIGN_QA_DIR',tempfile.mkdtemp(prefix='seminarroom-contrast-')));output.mkdir(parents=True,exist_ok=True)
(output/'contrast-results.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
assert all(p['passAAForNormalText'] for p in out)
print('PASS: 9 named semantic foreground/background pairs >= 4.5:1; not a full accessibility audit')
