# Tracked dependency patches

All patches are bound to exact versions in `pnpm-workspace.yaml` and verified by the frozen-lockfile install and full type-check gates. They fix upstream declaration defects without disabling TypeScript diagnostics or installing unused build systems.

| Package | Scope | Reason |
|---|---|---|
| `happy-dom@20.11.12` | type-only | Removes a `node:stream/web` constructor overload whose `UnderlyingDefaultSource` type does not exist in the pinned Node 22 declarations; the remaining `UnderlyingSource` overload covers the same input. |
| `naive-ui@2.45.2` | runtime | Shares the menu item renderer through the menu injection context while retaining the Submenu module's direct renderer import, preventing production `ReferenceError: itemRenderer is not defined` when nested menus are expanded. |
| `unconfig@7.5.0` | type-only | Replaces the generated, undefined `Args[0]` reference with the runtime function's actual optional `boolean` `force` parameter. |
| `unplugin@1.12.0` | type-only | Keeps the installed Vite/Rollup/esbuild types and represents absent optional Farm/Rspack/Webpack/Rolldown adapters as opaque types, so unused adapters do not require seven foreign build toolchains. |
| `unplugin@2.3.11` | type-only | Keeps the installed Vite/Rollup/esbuild types and represents absent optional Farm/Rspack/Webpack/Rolldown/Unloader adapters as opaque types. |
| `unplugin@3.3.0` | type-only | Keeps the installed Vite/Rollup/esbuild types and represents absent optional Farm/Rsbuild/Rspack/Webpack/Bun/Rolldown/Unloader adapters as opaque types. |
| `unplugin-vue-components@32.1.0` | generator | Removes generated global `eslint`, TypeScript, Biome and Oxlint suppressions; the generated declaration is tracked and must pass the normal gates. |
| `vite@7.3.6` | type-only | Intersects the module runner's environment with the application's `ImportMeta.env`, preserving required application environment keys. |
| `vue-i18n@11.4.10` | type-only | Uses Vue 3.5's supported `ComponentPublicInstance` in place of the removed `GenericComponentInstance` alias. |
