const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT) || 5173;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};

http.createServer((request,response)=>{
  const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const filePath = path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
  if(!filePath.startsWith(root+path.sep)){
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath,(error,data)=>{
    if(error){response.writeHead(error.code==='ENOENT'?404:500).end('Not found');return}
    response.writeHead(200,{'Content-Type':types[path.extname(filePath)]||'application/octet-stream'}).end(data);
  });
}).listen(port,()=>console.log(`hushday is running at http://localhost:${port}`));
