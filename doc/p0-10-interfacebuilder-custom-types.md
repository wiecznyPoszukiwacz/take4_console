# P0-10 — InterfaceBuilder.registerType

> Wersja: **0.25.0** · zadanie z `doc/take4-console-backlog.md#P0-10`.

## Cel

`InterfaceBuilder` dotąd rozpoznawał wyłącznie 15 wbudowanych tagów `type:`
(`window`, `button`, `textbox`, …). Konsumentom — zwłaszcza `rpcoon` — to nie
wystarcza: chcą wpiąć własne kontrolki (`YamlEditor`, `MethodPicker`, …) do
deklaratywnego layoutu bez duplikowania drzewa okien w kodzie.

## API

```typescript
class InterfaceBuilder {
  registerType(name: string, factory: CustomTypeFactory): void;
}

type CustomTypeFactory = (node: YamlWindowDef, ctx: CustomTypeContext) => Window;

interface CustomTypeContext {
  wp: WindowProperties;                  // pos/size/border/… już wyliczone
  registry: StyleRegistry;               // aktywny rejestr stylów
  resolveCallback: (id: string | undefined)
    => ((...args: unknown[]) => void) | undefined;
}
```

- Fabryka dostaje surowy węzeł YAML oraz zresolvowany `wp`. Może wziąć
  `ctx.wp` 1:1 i przekazać do własnego konstruktora albo dokleić dodatkowe
  pola z `node` / `node.props`.
- `node.props: Record<string, unknown>` to nowe wolne pole `YamlWindowDef`
  przeznaczone dla custom kontrolek — wbudowane typy je ignorują.
- `resolveCallback('foo')` zwraca callback zarejestrowany wcześniej przez
  `registerCallback('foo', fn)` — dzięki temu custom kontrolki mogą korzystać
  z tej samej tabeli co `onPress` / `onChange` Buttona.
- Próba rejestracji pod nazwą wbudowanego typu (`button`, `listbox`, …)
  rzuca wyjątkiem. Nazwy custom nie mogą shadowować wbudowanych.
- Jeśli zwrócony `Window` eksponuje `handleKey()`, `InterfaceBuilder`
  automatycznie rejestruje go w `WindowManager` (o ile przekazano `wm`
  do `build()`), łącznie z łańcuchem rodziców dla dialogów.

## Algorytm

W `InterfaceBuilder.buildNode` switch `def.type ?? 'window'` spada do
`default` zarówno dla `undefined`, jak i dla custom tagów. W gałęzi `default`:

1. `def.type` → lookup w `this.customTypes`.
2. Brak wpisu → stary path (`new Window(wp)`).
3. Wpis jest → budujemy `ctx`, wołamy fabrykę, pushujemy wynik do
   `pending[]` gdy `handleKey` jest obecne.

Dzieci, `content`, mapowanie `id → Window` przechodzą przez dotychczasową
logikę `buildNode`, więc custom kontrolka może mieć `children:` i zapisywać
statyczny tekst przez `content:` tak samo jak wbudowane typy.

## Przykład

```typescript
import { InterfaceBuilder, Window } from 'take4-console';

class Badge extends Window {
  public constructor(wp, private msg: string, private styleId: number) {
    super(wp);
  }
  public override render(): void {
    this.clear();
    this.writeText(this.msg, { x: 0, y: 0, style: this.styleId });
    super.render();
  }
}

const ib = new InterfaceBuilder();
ib.registerType('badge', (node, ctx) => {
  const p = (node.props ?? {}) as { text?: string; color?: number };
  const sid = ctx.registry.register({ foreground: p.color ?? 220, bold: true });
  return new Badge(ctx.wp, p.text ?? '', sid);
});
```

```yaml
- id: buildBadge
  type: badge
  pos: { x: 18, y: 0 }
  size: { width: 10, height: 1 }
  props:
    text: "P0-10 "
    color: 220
```

## Kompatybilność wsteczna

- `YamlWindowDef.type` jest teraz `YamlWindowType | (string & {})` —
  starsze kody TS kompilują się bez zmian (literalne wbudowane tagi
  dopasowują się do `YamlWindowType`).
- `YamlWindowDef.props` jest opcjonalne. YAML-e nie używające custom
  typów są nieporuszone.
- Gałąź `default` nadal zwraca `new Window(wp)` dla pustego `type`.
  Jedyna różnica — najpierw sprawdzany jest rejestr custom typów.

## Pliki

- `src/Screen/types.mts` — nowe: `type?: YamlWindowType | (string & {})`,
  `props?`, `CustomTypeContext`, `CustomTypeFactory`.
- `src/Screen/InterfaceBuilder.mts` — pole `customTypes`, metoda
  `registerType()`, nowa gałąź w `default` switcha, helper `isFocusable()`.
- `src/index.mts` — reeksport `CustomTypeContext` / `CustomTypeFactory`.
- `src/demo.mts` — klasa `Badge`, rejestracja `registerType('badge', …)`.
- `src/layout.yaml` — nowe `id: buildBadge` w headerze.
- `tests/InterfaceBuilder.test.mts` — nowy blok `describe('registerType', …)`
  z siedmioma przypadkami (custom typ, props, callback lookup, auto-focus,
  non-focusable, kolizja z built-inem, dzieci).
- `package.json` — bump `0.24.0 → 0.25.0`.
- `CHANGELOG.md` — wpis pod `[0.25.0]`.
