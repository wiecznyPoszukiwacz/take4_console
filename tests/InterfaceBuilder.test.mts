import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterfaceBuilder } from '../src/Screen/InterfaceBuilder.mjs';
import { Screen } from '../src/Screen/Screen.mjs';
import { Window } from '../src/Screen/Window.mjs';
import { Button } from '../src/Screen/controls/Button.mjs';
import { TextBox } from '../src/Screen/controls/TextBox.mjs';
import { TextArea } from '../src/Screen/controls/TextArea.mjs';
import { Checkbox } from '../src/Screen/controls/Checkbox.mjs';
import { Radio } from '../src/Screen/controls/Radio.mjs';
import { WindowManager } from '../src/Screen/WindowManager.mjs';

// Stub render so tests don't hit process.stdout.
vi.spyOn(Screen.prototype, 'render').mockImplementation(() => {});

function makeScreen(): Screen {
  return new Screen();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InterfaceBuilder', () => {
  let screen: Screen;
  let builder: InterfaceBuilder;

  beforeEach(() => {
    screen  = makeScreen();
    builder = new InterfaceBuilder();
  });

  // ── Basic window ─────────────────────────────────────────────────────────────

  describe('window type', () => {
    it('creates a basic window and adds it to Screen', () => {
      const yaml = `
windows:
  - id: main
    size: { width: 20, height: 10 }
`;
      const result = builder.build(yaml, screen);
      expect(result.get('main')).toBeInstanceOf(Window);
    });

    it('sets window size correctly', () => {
      const yaml = `
windows:
  - id: w
    size: { width: 30, height: 15 }
`;
      const result = builder.build(yaml, screen);
      const win = result.get('w')!;
      expect(win.getSize()).toEqual({ width: 30, height: 15 });
    });

    it('supports percentage size', () => {
      const yaml = `
windows:
  - id: w
    size: { width: "100%", height: "50%" }
`;
      builder.build(yaml, screen);
      // no error thrown = success; percent sizes are resolved against screen
    });

    it('supports fill size shorthand', () => {
      const yaml = `
windows:
  - id: w
    size: fill
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('supports fillWidth size shorthand', () => {
      const yaml = `
windows:
  - id: w
    size: { fillWidth: 5 }
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('writes content text', () => {
      const yaml = `
windows:
  - id: header
    size: { width: 20, height: 3 }
    content: "Hello"
`;
      const result = builder.build(yaml, screen);
      const win = result.get('header')!;
      expect(win.getCell(0, 0).char).toBe('H');
      expect(win.getCell(4, 0).char).toBe('o');
    });

    it('supports pos center', () => {
      const yaml = `
windows:
  - id: w
    pos: center
    size: { width: 10, height: 5 }
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('supports pos preset top', () => {
      const yaml = `
windows:
  - id: w
    pos: { preset: top, offset: 5 }
    size: { width: 10, height: 3 }
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('supports edge-relative pos (negative numbers)', () => {
      const yaml = `
windows:
  - id: w
    pos: { x: -1, y: -1 }
    size: { width: 10, height: 3 }
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('supports topLeft pos preset', () => {
      const yaml = `
windows:
  - id: w
    pos: topLeft
    size: { width: 10, height: 3 }
`;
      const result = builder.build(yaml, screen);
      const win = result.get('w')!;
      expect(win.x).toBe(0);
      expect(win.y).toBe(0);
    });

    it('throws on invalid size', () => {
      const yaml = `
windows:
  - id: w
    size: { width: "abc", height: 5 }
`;
      expect(() => builder.build(yaml, screen)).toThrow();
    });

    it('throws when size is missing for window type', () => {
      const yaml = `
windows:
  - id: w
    type: window
`;
      expect(() => builder.build(yaml, screen)).toThrow(/Missing required "size"/);
    });

    it('builds nested children', () => {
      const yaml = `
windows:
  - id: parent
    size: { width: 40, height: 20 }
    children:
      - id: child
        size: { width: 10, height: 5 }
`;
      const result = builder.build(yaml, screen);
      expect(result.get('parent')).toBeInstanceOf(Window);
      expect(result.get('child')).toBeInstanceOf(Window);
    });

    it('resolves fillWidth child size against the parent after parent is sized', () => {
      // Parent has percentage size; child has fillWidth. Without reflow, the child
      // would be sized against the placeholder 1×1 parent and get width 0.
      const yaml = `
windows:
  - id: outer
    size: { width: "50%", height: 10 }
    border: { top: true, right: true, bottom: true, left: true, style: single }
    children:
      - id: tb
        type: textbox
        pos: { x: 0, y: 0 }
        size: { fillWidth: 3 }
`;
      const result = builder.build(yaml, screen);
      const tb = result.get('tb')!;
      // Screen is 80×24; outer width = 40; inner = 38; tb width = 38.
      expect(tb.getSize().width).toBeGreaterThan(0);
    });

    it('resolves percentage child size nested two levels deep', () => {
      const yaml = `
windows:
  - id: root
    size: { width: "80%", height: "80%" }
    children:
      - id: inner
        size: { width: "50%", height: "50%" }
        children:
          - id: leaf
            size: { width: "100%", height: "100%" }
`;
      const result = builder.build(yaml, screen);
      const root  = result.get('root')!;
      const inner = result.get('inner')!;
      const leaf  = result.get('leaf')!;
      expect(root.getSize().width).toBeGreaterThan(0);
      expect(inner.getSize().width).toBeGreaterThan(0);
      expect(leaf.getSize().width).toBeGreaterThan(0);
      // leaf should match inner's dimensions
      expect(leaf.getSize()).toEqual(inner.getSize());
    });

    it('writes static content after sizing so it is not lost on resize', () => {
      const yaml = `
windows:
  - id: panel
    size: { width: "50%", height: 5 }
    content: "Hi"
`;
      const result = builder.build(yaml, screen);
      const panel = result.get('panel')!;
      // render() needed to composite content into region
      panel.render();
      expect(panel.getCell(0, 0).char).toBe('H');
      expect(panel.getCell(1, 0).char).toBe('i');
    });

    it('returns windows without id only at root level', () => {
      const yaml = `
windows:
  - size: { width: 10, height: 3 }
  - id: named
    size: { width: 10, height: 3 }
`;
      const result = builder.build(yaml, screen);
      expect(result.size).toBe(1);
      expect(result.get('named')).toBeInstanceOf(Window);
    });
  });

  // ── Button ────────────────────────────────────────────────────────────────────

  describe('button type', () => {
    it('creates a Button instance', () => {
      const yaml = `
windows:
  - id: btn
    type: button
    size: { width: 12, height: 3 }
    label: "OK"
`;
      const result = builder.build(yaml, screen);
      expect(result.get('btn')).toBeInstanceOf(Button);
    });

    it('fires registered onPress callback', () => {
      const handler = vi.fn();
      builder.registerCallback('submit', handler);

      const yaml = `
windows:
  - id: btn
    type: button
    size: { width: 12, height: 3 }
    label: "Submit"
    onPress: submit
`;
      const result = builder.build(yaml, screen);
      const btn = result.get('btn') as Button;
      btn.handleKey('\r');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('ignores unknown onPress callback ID gracefully', () => {
      const yaml = `
windows:
  - id: btn
    type: button
    size: { width: 12, height: 3 }
    onPress: nonexistent
`;
      const result = builder.build(yaml, screen);
      const btn = result.get('btn') as Button;
      expect(() => btn.handleKey('\r')).not.toThrow();
    });

    it('sets disabled state', () => {
      const yaml = `
windows:
  - id: btn
    type: button
    size: { width: 12, height: 3 }
    disabled: true
`;
      const result = builder.build(yaml, screen);
      const btn = result.get('btn') as Button;
      expect(btn.isDisabled()).toBe(true);
    });
  });

  // ── TextBox ───────────────────────────────────────────────────────────────────

  describe('textbox type', () => {
    it('creates a TextBox instance', () => {
      const yaml = `
windows:
  - id: tb
    type: textbox
    size: { width: 20, height: 3 }
    value: "hello"
    placeholder: "type here"
`;
      const result = builder.build(yaml, screen);
      expect(result.get('tb')).toBeInstanceOf(TextBox);
    });
  });

  // ── TextArea ──────────────────────────────────────────────────────────────────

  describe('textarea type', () => {
    it('creates a TextArea instance', () => {
      const yaml = `
windows:
  - id: ta
    type: textarea
    size: { width: 30, height: 8 }
`;
      const result = builder.build(yaml, screen);
      expect(result.get('ta')).toBeInstanceOf(TextArea);
    });
  });

  // ── Checkbox ──────────────────────────────────────────────────────────────────

  describe('checkbox type', () => {
    it('creates a Checkbox instance without requiring size', () => {
      const yaml = `
windows:
  - id: cb
    type: checkbox
    label: "Remember me"
`;
      const result = builder.build(yaml, screen);
      expect(result.get('cb')).toBeInstanceOf(Checkbox);
    });

    it('sets initial checked state', () => {
      const yaml = `
windows:
  - id: cb
    type: checkbox
    label: "Opt"
    checked: true
`;
      const result = builder.build(yaml, screen);
      const cb = result.get('cb') as Checkbox;
      expect(cb.isChecked()).toBe(true);
    });

    it('fires onChange callback', () => {
      const handler = vi.fn();
      builder.registerCallback('toggle', handler);

      const yaml = `
windows:
  - id: cb
    type: checkbox
    label: "Opt"
    onChange: toggle
`;
      const result = builder.build(yaml, screen);
      const cb = result.get('cb') as Checkbox;
      cb.handleKey(' ');
      expect(handler).toHaveBeenCalledWith(true);
    });
  });

  // ── Radio ─────────────────────────────────────────────────────────────────────

  describe('radio type', () => {
    it('creates a Radio instance without requiring size', () => {
      const yaml = `
windows:
  - id: r1
    type: radio
    label: "Option A"
`;
      const result = builder.build(yaml, screen);
      expect(result.get('r1')).toBeInstanceOf(Radio);
    });

    it('fires onChange callback', () => {
      const handler = vi.fn();
      builder.registerCallback('pick', handler);

      const yaml = `
windows:
  - id: r1
    type: radio
    label: "Option A"
    onChange: pick
`;
      const result = builder.build(yaml, screen);
      const r = result.get('r1') as Radio;
      r.handleKey(' ');
      expect(handler).toHaveBeenCalledWith(true);
    });
  });

  // ── WindowManager integration ─────────────────────────────────────────────────

  describe('WindowManager integration', () => {
    it('registers focusable controls when wm is provided', () => {
      const wm = new WindowManager(screen);
      const spy = vi.spyOn(wm, 'register');

      const yaml = `
windows:
  - id: container
    size: { width: 40, height: 20 }
    children:
      - id: btn1
        type: button
        pos: { x: 1, y: 1 }
        size: { width: 10, height: 3 }
        label: "A"
      - id: cb1
        type: checkbox
        pos: { x: 1, y: 5 }
        label: "Opt"
`;
      builder.build(yaml, screen, wm);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('does not register when wm is not provided', () => {
      const wm = new WindowManager(screen);
      const spy = vi.spyOn(wm, 'register');

      const yaml = `
windows:
  - id: btn
    type: button
    size: { width: 10, height: 3 }
`;
      builder.build(yaml, screen);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not register plain windows with wm', () => {
      const wm = new WindowManager(screen);
      const spy = vi.spyOn(wm, 'register');

      const yaml = `
windows:
  - id: panel
    size: { width: 30, height: 10 }
`;
      builder.build(yaml, screen, wm);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── Border & background ───────────────────────────────────────────────────────

  describe('window options', () => {
    it('applies background from named style', () => {
      const yaml = `
styles:
  - name: my-bg
    background: 235
windows:
  - id: w
    size: { width: 10, height: 3 }
    background: my-bg
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('applies background from built-in style name', () => {
      const yaml = `
windows:
  - id: w
    size: { width: 10, height: 3 }
    background: "builtin:window-bg"
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('applies border: true', () => {
      const yaml = `
windows:
  - id: w
    size: { width: 10, height: 5 }
    border: true
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });

    it('applies detailed border config', () => {
      const yaml = `
windows:
  - id: w
    size: { width: 10, height: 5 }
    border:
      top: true
      right: true
      bottom: true
      left: true
      style: rounded
      color: 3
`;
      expect(() => builder.build(yaml, screen)).not.toThrow();
    });
  });

  // ── P0-3: flex layout support in YAML ─────────────────────────────────────

  describe('flex layout', () => {
    it('row layout with pos: flex / size: flex distributes children across parent width', () => {
      const yaml = `
windows:
  - id: row
    size: { width: 30, height: 5 }
    layout: row
    children:
      - id: a
        pos: flex
        size: flex
      - id: b
        pos: flex
        size: flex
      - id: c
        pos: flex
        size: flex
`;
      const result = builder.build(yaml, screen);
      const a = result.get('a')!;
      const b = result.get('b')!;
      const c = result.get('c')!;
      expect(a.getSize()).toEqual({ width: 10, height: 5 });
      expect(b.getSize()).toEqual({ width: 10, height: 5 });
      expect(c.getSize()).toEqual({ width: 10, height: 5 });
      expect(a.x).toBe(0);
      expect(b.x).toBe(10);
      expect(c.x).toBe(20);
    });

    it('gap and justifyContent end push fixed-size children to the right', () => {
      const yaml = `
windows:
  - id: row
    size: { width: 20, height: 3 }
    layout: row
    gap: 1
    justifyContent: end
    children:
      - id: a
        pos: flex
        size: { width: 5, height: 3 }
      - id: b
        pos: flex
        size: { width: 5, height: 3 }
`;
      const result = builder.build(yaml, screen);
      // 20 total, 2 * 5 = 10 children, gap 1 = 11, slack 9 → start at 9
      expect(result.get('a')!.x).toBe(9);
      expect(result.get('b')!.x).toBe(15);
    });

    it('column layout + padding + gap stacks children vertically inside the padded area', () => {
      const yaml = `
windows:
  - id: col
    size: { width: 10, height: 12 }
    layout: column
    padding: 1
    gap: 1
    children:
      - id: a
        pos: flex
        size: flex
      - id: b
        pos: flex
        size: flex
`;
      const result = builder.build(yaml, screen);
      // inner = 8 × 10; gap 1 between two → each height 4 (floor((10-1)/2)=4)
      const a = result.get('a')!;
      const b = result.get('b')!;
      expect(a.getSize()).toEqual({ width: 8, height: 4 });
      expect(a.x).toBe(1);
      expect(a.y).toBe(1);
      expect(b.y).toBe(1 + 4 + 1);
    });

    it('margin on a flex child reserves outer spacing inside the parent slot', () => {
      const yaml = `
windows:
  - id: row
    size: { width: 20, height: 5 }
    layout: row
    children:
      - id: a
        pos: flex
        size: flex
        margin: { left: 2, right: 3 }
      - id: b
        pos: flex
        size: flex
`;
      const result = builder.build(yaml, screen);
      const a = result.get('a')!;
      const b = result.get('b')!;
      // 20 - 5 (a's h-margin) = 15 split 1:1 → 7 / 8 (last takes leftover)
      expect(a.getSize().width).toBe(7);
      expect(b.getSize().width).toBe(8);
      expect(a.x).toBe(2);
      expect(b.x).toBe(2 + 7 + 3);
    });

    it('grid layout distributes children into cells', () => {
      const yaml = `
windows:
  - id: grid
    size: { width: 20, height: 10 }
    layout: grid
    gridColumns: 2
    children:
      - { id: a, pos: flex, size: flex }
      - { id: b, pos: flex, size: flex }
      - { id: c, pos: flex, size: flex }
      - { id: d, pos: flex, size: flex }
`;
      const result = builder.build(yaml, screen);
      expect(result.get('a')!.getSize()).toEqual({ width: 10, height: 5 });
      expect(result.get('d')!.x).toBe(10);
      expect(result.get('d')!.y).toBe(5);
    });

    it('supports per-axis flex/content inside { width, height }', () => {
      const yaml = `
windows:
  - id: row
    size: { width: 30, height: 4 }
    layout: row
    children:
      - id: auto
        pos: flex
        size: { width: content, height: 2 }
      - id: grow
        pos: flex
        size: { width: { flex: { grow: 1 } }, height: 2 }
`;
      const result = builder.build(yaml, screen);
      const auto = result.get('auto')!;
      const grow = result.get('grow')!;
      // 'auto' gets its natural width (1 by default for a fresh window)
      // 'grow' soaks up the rest of 30: 30 - 1 = 29
      expect(auto.getSize().width).toBe(1);
      expect(grow.getSize().width).toBe(29);
    });

    it('pos: { flex: N } reorders flex children', () => {
      const yaml = `
windows:
  - id: row
    size: { width: 30, height: 3 }
    layout: row
    children:
      - id: a
        pos: { flex: 2 }
        size: { width: 10, height: 3 }
      - id: b
        pos: { flex: 0 }
        size: { width: 10, height: 3 }
      - id: c
        pos: { flex: 1 }
        size: { width: 10, height: 3 }
`;
      const result = builder.build(yaml, screen);
      // sorted: b (order 0) → c (1) → a (2)
      expect(result.get('b')!.x).toBe(0);
      expect(result.get('c')!.x).toBe(10);
      expect(result.get('a')!.x).toBe(20);
    });
  });

  // ── Custom types (registerType) ─────────────────────────────────────────────

  describe('registerType', () => {
    it('instantiates a custom type via a registered factory', () => {
      class CustomBox extends Window {
        public readonly tag = 'custom-box';
      }
      builder.registerType('custombox', (_node, ctx) => new CustomBox(ctx.wp));
      const yaml = `
windows:
  - id: cb
    type: custombox
    size: { width: 10, height: 3 }
`;
      const result = builder.build(yaml, screen);
      const win = result.get('cb');
      expect(win).toBeInstanceOf(CustomBox);
      expect(win!.getSize()).toEqual({ width: 10, height: 3 });
    });

    it('passes through node.props to the factory', () => {
      let seen: unknown = undefined;
      builder.registerType('propreader', (node, ctx) => {
        seen = node.props;
        return new Window(ctx.wp);
      });
      const yaml = `
windows:
  - id: w
    type: propreader
    size: { width: 5, height: 2 }
    props:
      count: 7
      label: hello
`;
      builder.build(yaml, screen);
      expect(seen).toEqual({ count: 7, label: 'hello' });
    });

    it('resolves callback IDs through ctx.resolveCallback', () => {
      const spy = vi.fn();
      builder.registerCallback('tap', spy);
      let resolved: ((...args: unknown[]) => void) | undefined = undefined;
      builder.registerType('cbtaker', (node, ctx) => {
        resolved = ctx.resolveCallback(node.onPress);
        return new Window(ctx.wp);
      });
      const yaml = `
windows:
  - id: w
    type: cbtaker
    size: { width: 5, height: 2 }
    onPress: tap
`;
      builder.build(yaml, screen);
      expect(resolved).toBe(spy);
    });

    it('auto-registers focusable custom controls with WindowManager', () => {
      class FocusableBox extends Window {
        public handleKey(_key: string): void { /* no-op */ }
      }
      builder.registerType('focusbox', (_node, ctx) => new FocusableBox(ctx.wp));
      const wm = new WindowManager(screen);
      const yaml = `
windows:
  - id: fb
    type: focusbox
    size: { width: 4, height: 2 }
`;
      const result = builder.build(yaml, screen, wm);
      const fb = result.get('fb') as FocusableBox;
      wm.setFocus(fb);
      expect(wm.getFocused()).toBe(fb);
    });

    it('does not auto-register a non-focusable custom control', () => {
      builder.registerType('passive', (_node, ctx) => new Window(ctx.wp));
      const wm = new WindowManager(screen);
      const yaml = `
windows:
  - id: p
    type: passive
    size: { width: 4, height: 2 }
`;
      const result = builder.build(yaml, screen, wm);
      const p = result.get('p')!;
      // Non-focusable control should not become focused after setFocus.
      wm.setFocus(p as never);
      expect(wm.getFocused()).toBeNull();
    });

    it('throws when trying to override a built-in type', () => {
      expect(() => builder.registerType('button', (_node, ctx) => new Window(ctx.wp)))
        .toThrow(/reserved/);
    });

    it('supports children under a custom type', () => {
      class Container extends Window {
        public childAt(i: number): Window | undefined { return this.children[i]; }
      }
      builder.registerType('container', (_node, ctx) => new Container(ctx.wp));
      const yaml = `
windows:
  - id: outer
    type: container
    size: { width: 20, height: 10 }
    children:
      - id: inner
        size: { width: 5, height: 3 }
`;
      const result = builder.build(yaml, screen);
      const outer = result.get('outer') as Container;
      const inner = result.get('inner')!;
      expect(outer.childAt(0)).toBe(inner);
    });
  });
});
