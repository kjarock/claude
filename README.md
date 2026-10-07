# claude

Utilidades para [Claude Code](https://claude.com/claude-code).

| Utilidad | Qué hace |
| --- | --- |
| [prompt-coach](prompt-coach/) | `/coach <prompt>`: Haiku mejora el prompt y recomienda qué modelo usar para la tarea |
| [consumo-tokens](consumo-tokens/) | Barra sobre el prompt con el % de contexto, tokens y costo estimado (USD) de la sesión y del proyecto; botón **Compactar** al llegar al 80%; `/consumo` abre el detalle por proyecto |

Cada carpeta es un mod independiente.

## Instalación

1. Clona el repo, por ejemplo en `~/.claude/mods`.
2. En `~/.claude/settings.json`, lista la carpeta de cada mod en `CLAUDE_CODE_PLUGIN_DIRS`, separadas por `;` en Windows (`:` en macOS/Linux):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<usuario>\\.claude\\mods\\prompt-coach;C:\\Users\\<usuario>\\.claude\\mods\\consumo-tokens"
  }
}
```

3. Abre una sesión nueva de Claude Code. Al editar los archivos de un mod, este se recarga solo.

Cada mod se puede validar y probar con `claude plugin validate <carpeta>` y `claude plugin test <carpeta>`.
