# Comandos y resultados de baseline

Fecha: 2026-10-05 America/Lima. Directorio de ejecución: raíz de `comunicate`, PowerShell. Los bloques enumeran comandos ejecutados; las lecturas de archivos no modificaron el repositorio. No se ejecutó npm audit fix, deploy, migrate, reset, purge, backfill, entrenamiento, push ni operaciones de datos destructivas.

## Inspección
```powershell
Get-Content -LiteralPath 'C:\Users\COMUNICATE\.codex\attachments\69ee46e1-cd85-4537-a911-418f3fee73b6\Texto pegado.txt'
Get-Content -LiteralPath '.agents/skills/code-guardian/SKILL.md'
Get-Content AGENTS.md
Get-Content .agents/skills/code-guardian/references/audit-playbook.md
Get-Content .agents/skills/code-guardian/references/critical-flows.md
Get-Content .agents/skills/code-guardian/references/verification-and-reporting.md
git status --short
git branch
git log --oneline -10
git diff --stat
git diff --numstat
Get-Content package.json
Get-Content packages/local-field-verifier/package.json
Get-Content .gitignore
git ls-files '*env*' '*credential*' '*serviceAccount*'
Get-Content netlify.toml
Get-Content firebase.json
Get-Content vite.config.js
Get-Content eslint.config.js
Get-Content .env.example
Get-Content netlify/functions/_firebaseAdmin.mjs
Get-Content netlify/functions/_shared.mjs
Get-Content netlify/functions/_roles.mjs
Get-Content src/lib/firebase.js
Get-Content src/config/auth.js
git diff -- src/app/App.jsx src/services/functionsClient.js netlify/functions/solicitudesPublicas.mjs
Get-Content netlify/functions/usuarios.mjs
Get-Content firestore.rules
Get-Content scripts/local-api.mjs
Get-Content src/repositories/firestoreRepository.js
Get-Content docs/enterprise/deployment-devops.md
Get-Content packages/local-field-verifier/training/evaluate.mjs
Get-Content packages/local-field-verifier/training/io.mjs
Get-Content packages/local-field-verifier/training/train.mjs
Get-Content src/features/settings/ConfiguracionLogo.jsx -TotalCount 100
Get-Content src/services/functionsClient.js -TotalCount 100
Get-Content netlify/tests/firebaseReadBudget.test.mjs -TotalCount 60
Get-Content packages/local-field-verifier/training/data/.gitignore
Get-Content .firebaserc
Get-Content firestore.rules -TotalCount 90
Get-Content firestore.rules | Select-Object -Skip 208 -First 14
Get-Content netlify/functions/_observability.mjs | Select-Object -First 150
Get-Content src/app/App.jsx | Select-Object -Skip 70 -First 35
Get-Content src/app/App.jsx | Select-Object -Skip 595 -First 40
Get-Command firebase,netlify,docker -ErrorAction SilentlyContinue | Select-Object Name,Source
git ls-files 'functions/*' 'apps/*' '*prisma*' '*migration*' '*storage*' '*tsconfig*'
```
Resultado: repositorio JavaScript/React/Netlify/Firebase; cambios locales de roles/solicitudes identificados y respaldados. Firebase CLI y Docker encontrados; Netlify CLI no encontrado en PATH. No se arrancaron emuladores ni Docker. `.env` reales se inspeccionaron por nombres únicamente con Node, sin imprimir valores.

Búsquedas ejecutadas:
```powershell
rg --files -g 'AGENTS.md' -g 'package.json' -g '*lock*' -g '*prisma*' -g '*vercel*' -g '*railway*' -g '*firebase*' -g '.env*' -g '!node_modules' -g '!dist'
rg --files -g '!package-lock.json' -g '!deno.lock' -g '!skills-lock.json' -g '!node_modules' -g '!dist' -g '!public/**' -g '!*.png' -g '!*.jpg' -g '!*.jpeg' -g '!*.pdf' -g '!*.webp' -g '!*.woff*' -g '!*.svg'
rg -n 'https://|health|VITE_BACKEND_BASE_URL' README.md src/config src/services/functionsClient.js docs/enterprise/configuration.md public/robots.txt
rg -n 'process\.env\.|import\.meta\.env\.' netlify/functions scripts src vite.config.js
rg -n 'base64|data:|chunk|upload|delete|setDoc|addDoc' src/features/settings/ConfiguracionLogo.jsx src/features/registros/registroEvidencias.js netlify/functions/dniFotos.mjs
rg -n 'backup|respaldo|exportar|JSON.stringify|fetchAllOrdered' src/app/App.jsx
rg -n 'Organization|CompanySettings|prisma|railway|vercel' package.json src netlify packages firebase.json netlify.toml
rg -n 'validLogo|logo.size|imageBase64' firestore.rules
rg -n 'REFERENCE|PAGE_SIZE|referenceQuery' src/app/App.jsx
```

## Backup y rama
```powershell
git add -u
git add netlify/functions/_roles.mjs netlify/functions/usuarios.mjs netlify/tests/roles.test.mjs src/features/settings/UsuariosSistema.jsx src/features/solicitudesPublicas/publicSolicitudRegistroDraft.js
git commit -m 'chore: backup before baseline and stabilization'
$baselineTag = 'baseline-pre-stabilization'
git show-ref --verify --quiet "refs/tags/$baselineTag"
if ($LASTEXITCODE -eq 0) {
  $baselineTag = 'baseline-2026-10-05'
  git show-ref --verify --quiet "refs/tags/$baselineTag"
  if ($LASTEXITCODE -eq 0) { $baselineTag = 'baseline-2026-10-05-' + (Get-Date -Format 'HHmmss') }
}
git tag $baselineTag
$baselineBranch = 'chore/baseline-stabilization'
$branchVersion = 2
while (git branch --list $baselineBranch) {
  $baselineBranch = "chore/baseline-stabilization-v$branchVersion"
  $branchVersion++
}
git switch -c $baselineBranch
git status --short
git rev-parse HEAD
git tag --points-at HEAD
$backupDir = Join-Path $env:USERPROFILE '.codex/backups/comunicate'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupFile = Join-Path $backupDir 'baseline-2026-10-05-b2088dd.bundle'
if (Test-Path -LiteralPath $backupFile) { throw 'Backup ya existe; no se sobrescribe' }
git bundle create $backupFile baseline-pre-stabilization
git bundle verify $backupFile
```
Resultado: backup b2088dd, tag y rama solicitados creados; bundle válido con historia completa. Las comprobaciones de inexistencia de ref devuelven 1 deliberadamente; no son fallos del backup.

## Validaciones iniciales
```powershell
node --version
npm --version
npm ls --depth=0
npm test
npm run lint
npm run build
npm run evaluate --prefix packages/local-field-verifier
npm audit --json > "$env:TEMP/comunicate-baseline-audit.json"
Copy-Item -LiteralPath "$env:TEMP/comunicate-baseline-audit.json" -Destination docs/baseline-evidence/npm-audit.json
```
Resultados: Node v24.14.0/npm 11.9.0; árbol directo válido; 159 tests pasan; lint 0 errores/6 warnings; build correcto; evaluación FALLÓ ENOENT por ruta duplicada. Audit reportó 16 alertas (el auditor retorna código no cero si encuentra vulnerabilidades; el wrapper imprimió un resumen JSON después). No se actualizaron dependencias.

## Correcciones y verificación final
Ediciones realizadas con apply_patch: redirect usuarios, ruta del evaluador, test de routing, verify, smoke y documentos. `package.json` se editó mediante ReadAllText/WriteAllText UTF-8 sin BOM, agregando verify y el nuevo test a la lista existente.

```powershell
node --test netlify/tests/baselineRouting.test.mjs
npm run evaluate --prefix packages/local-field-verifier -- --input training/evaluation-examples.json
New-Item -ItemType Directory -Force -Path docs/baseline-evidence | Out-Null
npm run verify *> docs/baseline-evidence/verify.log
$verifyCode = $LASTEXITCODE
Get-Content docs/baseline-evidence/verify.log -Tail 40
Write-Output "VERIFY_EXIT_CODE=$verifyCode"
node scripts/baseline-smoke.mjs > docs/baseline-evidence/local-smoke.json
node --env-file=.env scripts/baseline-smoke.mjs --production > docs/baseline-evidence/production-smoke.json
node --env-file=.env scripts/baseline-smoke.mjs --database > docs/baseline-evidence/database-smoke.json
node --check scripts/baseline-smoke.mjs
node --check scripts/verify.mjs
npm run evaluate:box-verifier -- --input packages/local-field-verifier/training/evaluation-examples.json > docs/baseline-evidence/evaluator.log
Get-Content docs/baseline-evidence/local-smoke.json
Get-Content docs/baseline-evidence/production-smoke.json
Get-Content docs/baseline-evidence/database-smoke.json
Get-Content docs/baseline-evidence/evaluator.log -First 12
Get-Content docs/baseline-evidence/verify.log -Tail 12
Get-Content docs/baseline-evidence/verify.log | Select-String -Pattern 'tests [0-9]|pass [0-9]|fail [0-9]|problems|\[verify\]'
git diff --check
git diff --stat
git status --short
```

`npm run verify` ejecutó exactamente `npm run lint`, `npm run test`, `npm run build`; omitió typecheck por ausencia. Exit 0, 160/160 tests, seis warnings, 2177 módulos. Smoke local: HTTP 200 frontend; nueve APIs 401 y portal público 400; CORS 204 origen permitido/ajeno; health 404. DB: cinco lecturas limitadas sin escrituras, todas correctas. Producción: root 200; rutas API consultadas 200 HTML, no JSON; backend auténtico NO VERIFICADO. Smoke de producción se repitió tras agregar inspección de assets; esta sufrió TimeoutError y quedó registrada. Un intento anterior de inspección con Node inline no se ejecutó por error de comillas en PowerShell; se reemplazó por el script versionado, sin modificar producción.

La evaluación raíz y paquete: seis ejemplos del fixture, 12/12 campos muestreados correctos. No evalúa todos los campos ni servicios reales. `git diff --check` sin errores; advertencias LF/CRLF son de Git en Windows.

## Commits de esta fase
```powershell
git add netlify.toml netlify/tests/baselineRouting.test.mjs packages/local-field-verifier/training/evaluate.mjs package.json scripts/verify.mjs scripts/baseline-smoke.mjs
git commit -m 'chore: stabilize baseline routing and verification'
git add docs/BASELINE.md docs/BASELINE_BUGS.md docs/REGRESSION_CHECKLIST.md docs/BASELINE_COMMANDS.md docs/baseline-evidence
git commit -m 'docs: record project baseline and regression evidence'
git status --short
git branch --show-current
git log --oneline -3
git diff baseline-pre-stabilization..HEAD --stat
```

No se hizo push. El último commit del log es el cierre documental; las evidencias identifican el baseline por el commit/tag de respaldo y su rama.

## Herramientas adicionales
El navegador integrado se invocó con `await cua.createBrowserTab("iab", "https://comunicate-tacna.web.app", {visible: false})`; agotó el plazo (~30s) y reinició el kernel. No devolvió pantalla ni evidencia visual. Se verificó además mediante Node que los artefactos de evidencia no contienen coincidencias con los valores de las credenciales locales (0 coincidencias; no se imprimieron valores).
