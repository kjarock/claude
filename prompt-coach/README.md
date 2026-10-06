# prompt-coach

Mod para [Claude Code](https://claude.com/claude-code) que mejora tus prompts con un modelo barato (Haiku) y te recomienda qué modelo usar para cada tarea.

```
/coach <tu prompt>
```

Haiku analiza el prompt y se abre un panel con:

- tu prompt **original** y una versión **mejorada** (más clara, con contexto y criterios de aceptación), en el mismo idioma en que lo escribiste;
- el **tipo de tarea** detectado;
- tu **modelo actual** frente al **recomendado** (`haiku`, `sonnet` u `opus`) y el motivo.

| Tecla | Acción |
| --- | --- |
| `s` | Cambiar al modelo recomendado y enviar el prompt mejorado (solo si difiere del actual) |
| `m` | Enviar el prompt mejorado |
| `o` | Enviar el prompt original |
| `c` / `Esc` | Cancelar |

El análisis solo se ejecuta cuando usas `/coach`; el resto de tus prompts no pasa por el mod.

## Requisitos

- Claude Code **2.1.288 o superior**. Los mods con hooks de función son una API en *early access* y pueden cambiar entre versiones.
- Acceso a Haiku con tu cuenta (el análisis se cobra a tu cuenta, a precio de Haiku).

## Instalación

1. Clona el repositorio (el mod está en la subcarpeta `prompt-coach/`):

   ```bash
   git clone https://github.com/kjarock/claude.git ~/.claude/mods
   ```

2. Agrega la carpeta del mod a `~/.claude/settings.json` para cargarlo en todas las sesiones:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<tu-usuario>\\.claude\\mods\\prompt-coach"
     }
   }
   ```

   En macOS/Linux usa la ruta absoluta (`/Users/<tu-usuario>/.claude/mods/prompt-coach`). Si ya tienes otros mods, sepáralos con `;` en Windows o `:` en macOS/Linux.

3. Abre una sesión nueva de Claude Code y escribe `/coach`.

Para probarlo sin tocar la configuración:

```bash
claude --plugin-dir ~/.claude/mods/prompt-coach
```

Para actualizar: `git pull` dentro de la carpeta.

## Personalización

Los criterios para elegir modelo y el estilo de la mejora están en la constante `SYSTEM` de [`hooks/register.tsx`](hooks/register.tsx). El modelo que analiza es `ANALYZER_MODEL` (por defecto `haiku`).

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```

## Limitaciones

- El botón `s` cambia el modelo ejecutando `/model <x>` desde el mod. Si tu versión de Claude Code no lo permite, verás un aviso para ejecutarlo a mano; el prompt mejorado se envía igual.
- Si Haiku falla o su respuesta no es válida, el panel muestra el error y no se envía nada.
