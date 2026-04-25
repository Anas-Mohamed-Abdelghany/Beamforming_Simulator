import urllib.request

url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/SheppLogan_Phantom.svg/512px-SheppLogan_Phantom.svg.png'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as res, open('C:\\Users\\LAPTOP\\.gemini\\antigravity\\brain\\552b5c39-8e55-4867-8449-c2d7e12b0762\\shepp.png', 'wb') as f:
    f.write(res.read())
