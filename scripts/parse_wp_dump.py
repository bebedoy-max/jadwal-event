import re, sys, json

PATH = '/tmp/dl/f2.bin'
WANT = set(sys.argv[1:])

ESC = {'n':'\n','t':'\t','r':'\r','0':'\0','\\':'\\',"'":"'",'"':'"','Z':'\x1a','b':'\b'}

def unesc(v):
    if '\\' not in v:
        return v
    out=[];i=0
    while i < len(v):
        c=v[i]
        if c=='\\' and i+1<len(v):
            out.append(ESC.get(v[i+1], v[i+1])); i+=2
        else:
            out.append(c); i+=1
    return ''.join(out)

def parse_rows(s):
    rows=[]; cur=[]; buf=[]; inq=False; i=0; n=len(s); quoted=False
    while i < n:
        ch=s[i]
        if inq:
            if ch=='\\':
                buf.append(s[i:i+2]); i+=2; continue
            if ch=="'":
                inq=False; i+=1; continue
            buf.append(ch); i+=1; continue
        if ch=="'":
            inq=True; quoted=True; buf=[]; i+=1; continue
        if ch=='(':
            cur=[]; buf=[]; quoted=False; i+=1; continue
        if ch==')':
            cur.append(unesc(''.join(buf)) if quoted else raw(''.join(buf)))
            rows.append(cur); cur=[]; buf=[]; quoted=False; i+=1
            # skip until next '(' or end
            while i<n and s[i] not in '(':
                i+=1
            continue
        if ch==',':
            cur.append(unesc(''.join(buf)) if quoted else raw(''.join(buf)))
            buf=[]; quoted=False; i+=1; continue
        buf.append(ch); i+=1
    return rows

def raw(v):
    v=v.strip()
    if v=='' or v.upper()=='NULL':
        return None
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return v

outs={t:open('/tmp/wp/%s.jsonl'%t,'w') for t in WANT}
counts={t:0 for t in WANT}
cols={}

f=open(PATH,'r',encoding='utf-8',errors='replace')
line=f.readline()
while line:
    if line.startswith('INSERT INTO `'):
        t=line.split('`')[1]
        if t in WANT:
            m=re.match(r"INSERT INTO `[^`]+` \(([^)]*)\) VALUES", line)
            c=[x.strip().strip('`') for x in m.group(1).split(',')] if m else cols.get(t)
            cols[t]=c
            parts=[line]
            # incremental quote state
            def qstate(s, inq):
                i=0
                while i<len(s):
                    ch=s[i]
                    if inq:
                        if ch=='\\': i+=2; continue
                        if ch=="'": inq=False
                    elif ch=="'": inq=True
                    i+=1
                return inq
            inq=qstate(line, False)
            while inq or not parts[-1].rstrip().endswith(';'):
                nxt=f.readline()
                if not nxt: break
                parts.append(nxt)
                inq=qstate(nxt, inq)
            stmt=''.join(parts)
            body=stmt[stmt.index('VALUES')+6:].rstrip().rstrip(';')
            for vals in parse_rows(body):
                if len(vals)!=len(c):
                    continue
                outs[t].write(json.dumps(dict(zip(c, vals)), ensure_ascii=False)+'\n')
                counts[t]+=1
            line=f.readline(); continue
    line=f.readline()

for o in outs.values(): o.close()
print(counts)
