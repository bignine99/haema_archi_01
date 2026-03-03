@echo off
chcp 65001 >nul
echo === Flexity Frontend Deploy ===

xcopy /Y "frontend\src\components\three\SceneViewer.tsx" "C:\dev\flexity-frontend\src\components\three\"
xcopy /Y "frontend\src\store\projectStore.ts" "C:\dev\flexity-frontend\src\store\"
xcopy /Y "frontend\src\components\ui\ControlPanel.tsx" "C:\dev\flexity-frontend\src\components\ui\"
xcopy /Y "frontend\src\components\ui\Dashboard.tsx" "C:\dev\flexity-frontend\src\components\ui\"
xcopy /Y "frontend\src\components\ui\RegulationPanel.tsx" "C:\dev\flexity-frontend\src\components\ui\"
xcopy /Y "frontend\src\App.tsx" "C:\dev\flexity-frontend\src\"
xcopy /Y "frontend\src\services\regulationEngine.ts" "C:\dev\flexity-frontend\src\services\"
xcopy /Y "frontend\src\services\documentParser.ts" "C:\dev\flexity-frontend\src\services\"
xcopy /Y "frontend\src\components\ui\DocumentUploader.tsx" "C:\dev\flexity-frontend\src\components\ui\"
xcopy /Y "frontend\src\index.css" "C:\dev\flexity-frontend\src\"
xcopy /Y "frontend\src\main.tsx" "C:\dev\flexity-frontend\src\"

echo === ALL DONE ===
