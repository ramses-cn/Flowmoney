#!/usr/bin/env bash
# ============================================================
# FlowMoney — Script para subir el proyecto a GitHub
# ============================================================
# Requisitos:
#   - git instalado
#   - Cuenta GitHub con repo vacío creado
#
# Uso:
#   1. Crea un repo vacío en https://github.com/new
#      Nombre: flowmoney (o el que prefieras)
#      NO inicialices con README/license/gitignore
#
#   2. Edita la variable GITHUB_REPO abajo con tu URL
#
#   3. Ejecuta: bash push_to_github.sh
#
#   4. Entra a https://aistudio.google.com/apps
#      Click "Create new app" → "Connect GitHub repo"
#      Selecciona tu repo flowmoney
# ============================================================

set -e

# === CONFIGURA AQUÍ TU REPO DE GITHUB ===
GITHUB_REPO="https://github.com/TU_USUARIO/flowmoney.git"
# ========================================

cd "$(dirname "$0")"

echo "🚀 Subiendo FlowMoney a GitHub..."
echo "   Repo destino: $GITHUB_REPO"
echo ""

# Inicializar git si no existe
if [ ! -d .git ]; then
  git init -q
  echo "✓ Git inicializado"
fi

# Asegurar que .gitignore excluye node_modules y archivos pesados
if [ ! -f .gitignore ]; then
  cat > .gitignore << 'EOF'
node_modules/
build/
dist/
coverage/
.DS_Store
*.log
.env*
!.env.example
.data/
EOF
fi

# Agregar todos los archivos
git add -A
echo "✓ Archivos agregados: $(git ls-files | wc -l) archivos"

# Commit inicial si no hay commits
if ! git log --oneline | head -1 | grep -q .; then
  git commit -q -m "FlowMoney — Proyecto completo con design Apple iOS 17 y 20 correcciones F1-F20"
  echo "✓ Commit inicial creado"
else
  git commit -q -m "FlowMoney — Actualización con design Apple iOS 17" 2>/dev/null || true
  echo "✓ Commit actualizado"
fi

# Configurar remote
git remote remove origin 2>/dev/null || true
git remote add origin "$GITHUB_REPO"
echo "✓ Remote origin configurado"

# Push
echo ""
echo "📤 Subiendo a GitHub (puede pedir credenciales)..."
git branch -M main
git push -u origin main

echo ""
echo "✅ ¡Listo!"
echo ""
echo "Siguientes pasos:"
echo "  1. Verifica tu repo en: ${GITHUB_REPO%.git}"
echo "  2. Ve a https://aistudio.google.com/apps"
echo "  3. Click 'Create new app' → 'Connect GitHub repo'"
echo "  4. Selecciona tu repo flowmoney"
echo "  5. AI Studio detectará automáticamente:"
echo "     - metadata.json (capabilities + permissions)"
echo "     - firebase-applet-config.json (lo inyecta AI Studio)"
echo "     - package.json (scripts npm)"
echo "  6. Configura secrets en el panel:"
echo "     - GEMINI_API_KEY"
echo "     - DB_PASS (si usas Cloud SQL)"
echo "     - SMTP_USER, SMTP_PASS (si usas email)"
echo "  7. Click 'Deploy' → Cloud Run"
echo ""
