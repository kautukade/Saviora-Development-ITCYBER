// npm run check:frontend — parses TS/TSX syntax with the installed TypeScript compiler.
// This is NOT a substitute for Next's full production build or cross-browser QA.
const ts=require('typescript'),fs=require('fs'),path=require('path');
const files=[];function visit(base){for(const x of fs.readdirSync(base,{withFileTypes:true})){const p=path.join(base,x.name);if(x.isDirectory())visit(p);else if(/\.(tsx?|jsx?)$/.test(x.name))files.push(p);}}visit('app');visit('components/frontend');
let problems=0;for(const file of files){const r=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});for(const d of r.diagnostics||[]){if(d.category===ts.DiagnosticCategory.Error){problems++;console.error(file,ts.flattenDiagnosticMessageText(d.messageText,' '));}}}
console.log(`Parsed ${files.length} frontend and route files; syntax errors: ${problems}`);process.exitCode=problems?1:0;
