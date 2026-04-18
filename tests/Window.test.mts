import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Window } from '../src/Screen/Window.mjs';
import { StyleRegistry } from '../src/Screen/StyleRegistry.mjs';
import { setRegistry } from '../src/Screen/RegistryHolder.mjs';
import { setPuaWidth } from '../src/Screen/textWidth.mjs';
import { Pos } from '../src/Screen/Pos.mjs';
import { Size, flex, content } from '../src/Screen/Size.mjs';

describe('Window', () => {
  describe('constructor / getSize()', () => {
    it('exposes the dimensions passed to the constructor', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(30, 10) });
      expect(win.getSize()).toEqual({ width: 30, height: 10 });
    });

    it('stores absolute position immediately', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(100, 100) });
      const child  = new Window({ pos: new Pos(5, 3), size: new Size(10, 4) });
      parent.addChild(child);
      expect(child.x).toBe(5);
      expect(child.y).toBe(3);
    });
  });

  describe('grid methods', () => {
    let reg: StyleRegistry;
    let win: Window;

    beforeEach(() => {
      reg = new StyleRegistry();
      setRegistry(reg);
      win = new Window({ pos: new Pos(0, 0), size: new Size(10, 5) });
    });

    it('getCell returns a blank cell after construction', () => {
      expect(win.getCell(0, 0)).toEqual({ char: ' ', attributes: {} });
    });

    it('setChar / getCell round-trip', () => {
      win.setChar(2, 1, 'X');
      expect(win.getCell(2, 1).char).toBe('X');
    });

    it('setCell / getCell round-trip with style', () => {
      const id = reg.register({ bold: true, foreground: 3 });
      win.setCell(0, 0, 'A', id);
      const cell = win.getCell(0, 0);
      expect(cell.char).toBe('A');
      expect(cell.attributes.bold).toBe(true);
      expect(cell.attributes.foreground).toBe(3);
    });

    it('mergeStyle merges onto existing cell', () => {
      const italicId    = reg.register({ italic: true });
      const underlineId = reg.register({ underline: true });
      win.setCell(0, 0, 'Z', italicId);
      win.mergeStyle(0, 0, underlineId);
      const cell = win.getCell(0, 0);
      expect(cell.char).toBe('Z');
      expect(cell.attributes.italic).toBe(true);
      expect(cell.attributes.underline).toBe(true);
    });

    it('clear resets all cells', () => {
      const id = reg.register({ bold: true });
      win.fill('#', id);
      win.clear();
      expect(win.getCell(0, 0)).toEqual({ char: ' ', attributes: {} });
      expect(win.getCell(9, 4)).toEqual({ char: ' ', attributes: {} });
    });

    it('fill sets every cell', () => {
      const id = reg.register({ dim: true });
      win.fill('*', id);
      expect(win.getCell(0, 0).char).toBe('*');
      expect(win.getCell(9, 4).char).toBe('*');
      expect(win.getCell(5, 2).attributes.dim).toBe(true);
    });
  });

  describe('addChild / render() compositing', () => {
    it('child content appears on parent region at child offset after render', () => {
      const reg    = new StyleRegistry();
      setRegistry(reg);
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const child  = new Window({ pos: new Pos(5, 2), size: new Size(5, 3) });
      const boldId = reg.register({ bold: true });
      child.setCell(0, 0, 'A', boldId);
      parent.addChild(child);

      parent.render();

      const cell = parent.getCell(5, 2);
      expect(cell.char).toBe('A');
      expect(cell.attributes.bold).toBe(true);
    });

    it('child content outside parent bounds is clipped', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 5) });
      const child  = new Window({ pos: new Pos(8, 0), size: new Size(5, 3) }); // extends past right edge
      child.fill('X');
      parent.addChild(child);

      parent.render();

      expect(parent.getCell(8, 0).char).toBe('X');
      expect(parent.getCell(9, 0).char).toBe('X');
    });

    it('render is recursive – grandchild content propagates to grandparent', () => {
      const grandparent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const parent      = new Window({ pos: new Pos(2, 2), size: new Size(10, 5) });
      const child       = new Window({ pos: new Pos(1, 1), size: new Size(3, 2) });
      child.setChar(0, 0, 'G');
      parent.addChild(child);
      grandparent.addChild(parent);

      grandparent.render();

      // child (1,1) inside parent (2,2) → grandparent cell (3,3)
      expect(grandparent.getCell(3, 3).char).toBe('G');
    });

    it('later children are blitted on top of earlier ones', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 5) });
      const bottom = new Window({ pos: new Pos(0, 0), size: new Size(5, 3) });
      const top    = new Window({ pos: new Pos(0, 0), size: new Size(5, 3) });
      bottom.fill('B');
      top.fill('T');
      parent.addChild(bottom);
      parent.addChild(top);

      parent.render();

      expect(parent.getCell(0, 0).char).toBe('T');
    });

    it('parent content set before render is preserved where no child overlaps', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 5) });
      const child  = new Window({ pos: new Pos(5, 0), size: new Size(5, 5) });
      parent.fill('P');
      child.fill('C');
      parent.addChild(child);

      parent.render();

      expect(parent.getCell(0, 0).char).toBe('P');
      expect(parent.getCell(5, 0).char).toBe('C');
    });

    it('child with Pos.right() is right-aligned after render', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const child  = new Window({ pos: Pos.right(), size: new Size(5, 3) });
      child.fill('R');
      parent.addChild(child);
      parent.render();
      // right-aligned: x = 20 - 5 - 0 = 15
      expect(parent.getCell(15, 0).char).toBe('R');
      expect(parent.getCell(19, 0).char).toBe('R');
    });

    it('child with Pos.bottomRight() is bottom-right-aligned after render', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const child  = new Window({ pos: Pos.bottomRight(), size: new Size(4, 2) });
      child.fill('Z');
      parent.addChild(child);
      parent.render();
      // x = 20-4=16, y = 10-2=8
      expect(parent.getCell(16, 8).char).toBe('Z');
      expect(parent.getCell(19, 9).char).toBe('Z');
    });

    it('child with Pos.center() is centered after render', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const child  = new Window({ pos: Pos.center(), size: new Size(4, 2) });
      child.fill('C');
      parent.addChild(child);
      parent.render();
      // x = floor((20-4)/2) = 8, y = floor((10-2)/2) = 4
      expect(parent.getCell(8, 4).char).toBe('C');
    });
  });

  describe('percentage-based sizes', () => {
    it('Size.fill() fills the entire parent', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const child  = new Window({ pos: Pos.topLeft(), size: Size.fill() });
      parent.addChild(child); // resolves to 20×10
      child.fill('F');
      parent.render();
      expect(parent.getCell(0, 0).char).toBe('F');
      expect(parent.getCell(19, 9).char).toBe('F');
    });

    it('Size.fill() in a bordered parent fills only the inner area', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), border: true });
      const child  = new Window({ pos: Pos.topLeft(), size: Size.fill() });
      parent.addChild(child); // should resolve to 18×8
      expect(child.getSize()).toEqual({ width: 18, height: 8 });
      child.fill('F');
      parent.render();
      // inner top-left
      expect(parent.getCell(1, 1).char).toBe('F');
      // inner bottom-right
      expect(parent.getCell(18, 8).char).toBe('F');
      // corners must remain border chars
      expect(parent.getCell(0, 0).char).toBe('┌');
      expect(parent.getCell(19, 9).char).toBe('┘');
    });
  });

  describe('background option', () => {
    it('fills entire region with background color on render', () => {
      const reg  = new StyleRegistry();
      setRegistry(reg);
      const bgId = reg.register({ background: 236 });
      const win  = new Window({ pos: new Pos(0, 0), size: new Size(5, 3), background: bgId });
      win.render();
      expect(win.getCell(0, 0).attributes.background).toBe(236);
      expect(win.getCell(4, 2).attributes.background).toBe(236);
    });

    it('undefined background leaves region blank', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 3) });
      win.render();
      expect(win.getCell(0, 0)).toEqual({ char: ' ', attributes: {} });
    });

    it('StyleId 0 background leaves region blank', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 3), background: 0 });
      win.render();
      expect(win.getCell(0, 0)).toEqual({ char: ' ', attributes: {} });
    });

    it('inactive window gets dim on background cells', () => {
      const reg  = new StyleRegistry();
      setRegistry(reg);
      const bgId = reg.register({ background: 236 });
      const win  = new Window({ pos: new Pos(0, 0), size: new Size(5, 3), background: bgId, active: false });
      win.render();
      expect(win.getCell(2, 1).attributes.dim).toBe(true);
    });

    it('active window does not get dim on background cells', () => {
      const reg  = new StyleRegistry();
      setRegistry(reg);
      const bgId = reg.register({ background: 236 });
      const win  = new Window({ pos: new Pos(0, 0), size: new Size(5, 3), background: bgId, active: true });
      win.render();
      expect(win.getCell(2, 1).attributes.dim).toBeUndefined();
    });
  });

  describe('border option', () => {
    it('border: true draws all four sides with single style', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: true });
      win.render();
      expect(win.getCell(0, 0).char).toBe('┌');
      expect(win.getCell(4, 0).char).toBe('┐');
      expect(win.getCell(0, 3).char).toBe('└');
      expect(win.getCell(4, 3).char).toBe('┘');
      expect(win.getCell(2, 0).char).toBe('─');
      expect(win.getCell(0, 1).char).toBe('│');
    });

    it('border: double style uses double-line characters', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, right: true, bottom: true, left: true, style: 'double' } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('╔');
      expect(win.getCell(4, 0).char).toBe('╗');
      expect(win.getCell(2, 0).char).toBe('═');
      expect(win.getCell(0, 1).char).toBe('║');
    });

    it('border: rounded style uses rounded corners', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, right: true, bottom: true, left: true, style: 'rounded' } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('╭');
      expect(win.getCell(4, 0).char).toBe('╮');
      expect(win.getCell(0, 3).char).toBe('╰');
      expect(win.getCell(4, 3).char).toBe('╯');
    });

    it('only top border draws a horizontal line without corners', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('─');
      expect(win.getCell(4, 0).char).toBe('─');
      expect(win.getCell(0, 1).char).toBe(' '); // no left side
    });

    it('only top+bottom borders skip left and right vertical lines', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, bottom: true } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('─');
      expect(win.getCell(0, 3).char).toBe('─');
      expect(win.getCell(0, 1).char).toBe(' '); // no vertical sides
    });

    it('border is skipped when window is 1×1', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(1, 1), border: true });
      win.render();
      expect(win.getCell(0, 0).char).toBe(' ');
    });

    it('top border only requires height >= 1', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(3, 1), border: { top: true } });
      win.render();
      expect(win.getCell(1, 0).char).toBe('─');
    });

    it('bottom border is skipped when height < 2', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(3, 1), border: { top: true, bottom: true } });
      win.render();
      expect(win.getCell(1, 0).char).toBe('─'); // top drawn
      // height is 1, so bottom would overlap top – skipped
    });
  });

  describe('writeText()', () => {
    let reg: StyleRegistry;
    let win: Window;

    beforeEach(() => {
      reg = new StyleRegistry();
      setRegistry(reg);
      win = new Window({ pos: new Pos(0, 0), size: new Size(10, 5) });
    });

    it('writes from (0,0) by default', () => {
      win.writeText('hello');
      expect(win.getCell(0, 0).char).toBe('h');
      expect(win.getCell(1, 0).char).toBe('e');
      expect(win.getCell(4, 0).char).toBe('o');
    });

    it('writes at the given position', () => {
      win.writeText('hi', { x: 3, y: 1 });
      expect(win.getCell(3, 1).char).toBe('h');
      expect(win.getCell(4, 1).char).toBe('i');
    });

    it('applies style to each character', () => {
      const id = reg.register({ bold: true, foreground: 196 });
      win.writeText('A', { style: id });
      const cell = win.getCell(0, 0);
      expect(cell.char).toBe('A');
      expect(cell.attributes.bold).toBe(true);
      expect(cell.attributes.foreground).toBe(196);
    });

    it('newline moves to next row at column startX', () => {
      win.writeText('AB\nCD');
      expect(win.getCell(0, 0).char).toBe('A');
      expect(win.getCell(1, 0).char).toBe('B');
      expect(win.getCell(0, 1).char).toBe('C');
      expect(win.getCell(1, 1).char).toBe('D');
    });

    it('newline resets x to startX, not to 0', () => {
      win.writeText('X\nY', { x: 2 });
      expect(win.getCell(2, 0).char).toBe('X');
      expect(win.getCell(2, 1).char).toBe('Y');
    });

    it('characters beyond window width are silently clipped', () => {
      const narrow = new Window({ pos: new Pos(0, 0), size: new Size(5, 3) });
      expect(() => narrow.writeText('hello world')).not.toThrow();
      expect(narrow.getCell(4, 0).char).toBe('o');
    });

    it('empty string does not throw', () => {
      expect(() => win.writeText('')).not.toThrow();
    });

    it('writeText(0,0) in a bordered window lands inside the border', () => {
      const bordered = new Window({ pos: new Pos(0, 0), size: new Size(10, 5), border: true });
      bordered.writeText('hi');
      bordered.render();
      // border at row 0 – content should start at (1,1)
      expect(bordered.getCell(1, 1).char).toBe('h');
      expect(bordered.getCell(2, 1).char).toBe('i');
      // border characters must not be overwritten
      expect(bordered.getCell(0, 0).char).toBe('┌');
    });

    it('writeText with explicit coords are relative to inner area', () => {
      const bordered = new Window({ pos: new Pos(0, 0), size: new Size(10, 5), border: true });
      bordered.writeText('AB', { x: 1, y: 1 });
      bordered.render();
      // inner (1,1) maps to absolute (2,2)
      expect(bordered.getCell(2, 2).char).toBe('A');
      expect(bordered.getCell(3, 2).char).toBe('B');
    });

    it('writeText clips at inner area boundary, not at full window boundary', () => {
      // window 6 wide, full border → inner width = 4
      const bordered = new Window({ pos: new Pos(0, 0), size: new Size(6, 4), border: true });
      bordered.writeText('ABCDE'); // 5 chars, only 4 fit inside
      bordered.render();
      expect(bordered.getCell(1, 1).char).toBe('A');
      expect(bordered.getCell(4, 1).char).toBe('D');
      // 'E' must not overwrite right border
      expect(bordered.getCell(5, 1).char).toBe('│');
    });
  });

  describe('getInnerOffset / getInnerSize', () => {
    it('no border → offset (0,0) and size equals full size', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 5) });
      expect(win.getInnerOffset()).toEqual({ x: 0, y: 0 });
      expect(win.getInnerSize()).toEqual({ width: 10, height: 5 });
    });

    it('full border → offset (1,1) and size shrunk by 2 on each axis', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 6), border: true });
      expect(win.getInnerOffset()).toEqual({ x: 1, y: 1 });
      expect(win.getInnerSize()).toEqual({ width: 8, height: 4 });
    });

    it('top-only border → offset (0,1) and height reduced by 1', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 6), border: { top: true } });
      expect(win.getInnerOffset()).toEqual({ x: 0, y: 1 });
      expect(win.getInnerSize()).toEqual({ width: 10, height: 5 });
    });

    it('left+right border only → offset (1,0) and width reduced by 2', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 6), border: { left: true, right: true } });
      expect(win.getInnerOffset()).toEqual({ x: 1, y: 0 });
      expect(win.getInnerSize()).toEqual({ width: 8, height: 6 });
    });
  });

  describe('decoration-aware child positioning', () => {
    it('absolute child in bordered parent is offset by border', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), border: true });
      const child  = new Window({ pos: new Pos(2, 3), size: new Size(4, 2) });
      parent.addChild(child);
      // inner offset (1,1) + child pos (2,3)
      expect(child.x).toBe(3);
      expect(child.y).toBe(4);
    });

    it('Pos.center() in bordered parent centers within inner area', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), border: true });
      const child  = new Window({ pos: Pos.center(), size: new Size(4, 2) });
      parent.addChild(child);
      // inner 18×8, child 4×2: floor((18-4)/2)=7, floor((8-2)/2)=3 → +offset(1,1) → (8,4)
      expect(child.x).toBe(8);
      expect(child.y).toBe(4);
    });

    it('child content lands inside border after render', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), border: true });
      const child  = new Window({ pos: new Pos(0, 0), size: new Size(3, 2) });
      child.fill('X');
      parent.addChild(child);
      parent.render();
      // child at inner (0,0) → absolute (1,1)
      expect(parent.getCell(1, 1).char).toBe('X');
      // border must remain
      expect(parent.getCell(0, 0).char).toBe('┌');
    });

    it('Pos.bottomRight() in bordered parent aligns to inner bottom-right', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), border: true });
      const child  = new Window({ pos: Pos.bottomRight(), size: new Size(3, 2) });
      child.fill('Z');
      parent.addChild(child);
      parent.render();
      // inner 18×8, child 3×2: x=18-3=15+1=16, y=8-2=6+1=7
      expect(parent.getCell(16, 7).char).toBe('Z');
      expect(parent.getCell(18, 8).char).toBe('Z');
      // bottom border untouched
      expect(parent.getCell(0, 9).char).toBe('└');
    });
  });

  describe('active / inactive', () => {
    it('inactive border gets dim attribute', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: true, active: false });
      win.render();
      expect(win.getCell(0, 0).attributes.dim).toBe(true);
      expect(win.getCell(2, 0).attributes.dim).toBe(true);
    });

    it('active border does not get dim attribute', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: true, active: true });
      win.render();
      expect(win.getCell(0, 0).attributes.dim).toBeUndefined();
    });

    it('setActive(false) makes border dim on next render', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: true });
      win.setActive(false);
      win.render();
      expect(win.getCell(0, 0).attributes.dim).toBe(true);
    });

    it('setActive(true) removes dim from border on next render', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: true, active: false });
      win.setActive(true);
      win.render();
      expect(win.getCell(0, 0).attributes.dim).toBeUndefined();
    });

    it('children are not affected by parent active state', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 5), active: false });
      const child  = new Window({ pos: new Pos(1, 1), size: new Size(3, 2), border: true, active: true });
      parent.addChild(child);
      parent.render();
      // child's top-left corner should not be dim
      expect(parent.getCell(1, 1).attributes.dim).toBeUndefined();
    });
  });

  describe('writeText() with wide characters', () => {
    let win: Window;

    beforeEach(() => {
      setRegistry(new StyleRegistry());
      win = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
    });

    afterEach(() => {
      setPuaWidth(1);
    });

    it('places a CJK character in two consecutive cells', () => {
      win.writeText('日');
      expect(win.getCell(0, 0).char).toBe('日');
      expect(win.getCell(1, 0).char).toBe('');
    });

    it('advances the cursor by 2 after a wide character', () => {
      win.writeText('日a');
      expect(win.getCell(0, 0).char).toBe('日');
      expect(win.getCell(1, 0).char).toBe('');
      expect(win.getCell(2, 0).char).toBe('a');
    });

    it('places an emoji (supplementary plane) in two consecutive cells', () => {
      win.writeText('🚀');
      expect(win.getCell(0, 0).char).toBe('🚀');
      expect(win.getCell(1, 0).char).toBe('');
    });

    it('skips a wide character whose right half would overflow the right edge', () => {
      // window is 10 wide → last column is x=9, wide char at x=9 has no room for right half
      win.writeText('aaaaaaaaa日');  // 9 ASCII + wide; wide would land at x=9
      expect(win.getCell(8, 0).char).toBe('a');
      // wide char skipped → cell 9 stays at the space-filled default
      expect(win.getCell(9, 0).char).toBe(' ');
    });

    it('skips zero-width combining marks but renders the base character', () => {
      win.writeText('e\u0301a'); // e + combining acute + a
      expect(win.getCell(0, 0).char).toBe('e');
      expect(win.getCell(1, 0).char).toBe('a');
    });

    it('skips control codes silently', () => {
      win.writeText('a\x07b');
      expect(win.getCell(0, 0).char).toBe('a');
      expect(win.getCell(1, 0).char).toBe('b');
    });

    it('honours the configured PUA width when placing a NerdFont glyph', () => {
      setPuaWidth(2);
      const win2 = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
      win2.writeText('\uF005a');
      expect(win2.getCell(0, 0).char).toBe('\uF005');
      expect(win2.getCell(1, 0).char).toBe('');
      expect(win2.getCell(2, 0).char).toBe('a');
    });

    it('newline returns startX and continues with wide characters', () => {
      win.writeText('日\n語');
      expect(win.getCell(0, 0).char).toBe('日');
      expect(win.getCell(1, 0).char).toBe('');
      expect(win.getCell(0, 1).char).toBe('語');
      expect(win.getCell(1, 1).char).toBe('');
    });
  });

  describe('getTextWidth()', () => {
    beforeEach(() => {
      setRegistry(new StyleRegistry());
    });

    it('matches stringWidth for narrow text', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
      expect(win.getTextWidth('hello')).toBe(5);
    });

    it('counts wide CJK characters as 2 cells each', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
      expect(win.getTextWidth('日本語')).toBe(6);
    });

    it('counts emoji as 2 cells each', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
      expect(win.getTextWidth('🚀x')).toBe(3);
    });
  });

  describe('writeText() with rich-text segments', () => {
    let reg: StyleRegistry;
    let win: Window;

    beforeEach(() => {
      reg = new StyleRegistry();
      setRegistry(reg);
      win = new Window({ pos: new Pos(0, 0), size: new Size(20, 3) });
    });

    it('treats an empty array as a no-op', () => {
      expect(() => win.writeText([])).not.toThrow();
      expect(win.getCell(0, 0).char).toBe(' ');
    });

    it('lays out segments inline; cursor flows across them', () => {
      win.writeText([
        { text: 'AB' },
        { text: 'CD' },
      ]);
      expect(win.getCell(0, 0).char).toBe('A');
      expect(win.getCell(1, 0).char).toBe('B');
      expect(win.getCell(2, 0).char).toBe('C');
      expect(win.getCell(3, 0).char).toBe('D');
    });

    it('applies per-segment style merged onto the base style', () => {
      const boldId = reg.register({ bold: true });
      const italicId = reg.register({ italic: true });
      win.writeText([
        { text: 'x', style: boldId },
        { text: 'y', style: italicId },
      ], { style: 0 });
      expect(win.getCell(0, 0).attributes.bold).toBe(true);
      expect(win.getCell(0, 0).attributes.italic).toBeUndefined();
      expect(win.getCell(1, 0).attributes.italic).toBe(true);
      expect(win.getCell(1, 0).attributes.bold).toBeUndefined();
    });

    it('segment attrs are registered on the fly (no pre-register needed)', () => {
      win.writeText([
        { text: 'R', attrs: { foreground: 196 } },
        { text: 'G', attrs: { foreground: 46 } },
      ], { style: 0 });
      expect(win.getCell(0, 0).attributes.foreground).toBe(196);
      expect(win.getCell(1, 0).attributes.foreground).toBe(46);
    });

    it('segment style overrides attrs when both are supplied', () => {
      const fgBlueId = reg.register({ foreground: 33 });
      win.writeText([
        { text: 'B', style: fgBlueId, attrs: { foreground: 196 } },
      ], { style: 0 });
      expect(win.getCell(0, 0).attributes.foreground).toBe(33);
    });

    it('base style from options.style is merged under segment styles', () => {
      const baseId = reg.register({ foreground: 252 });
      const emphId = reg.register({ bold: true });
      win.writeText([
        { text: 'e', style: emphId },
      ], { style: baseId });
      const cell = win.getCell(0, 0);
      expect(cell.attributes.foreground).toBe(252);
      expect(cell.attributes.bold).toBe(true);
    });

    it('segment style 0 leaves the base style unchanged', () => {
      const baseId = reg.register({ foreground: 252 });
      win.writeText([
        { text: 'p', style: 0 },
      ], { style: baseId });
      expect(win.getCell(0, 0).attributes.foreground).toBe(252);
    });

    it('newline in a segment resets x to startX and advances y', () => {
      win.writeText([
        { text: 'AB\nCD' },
      ], { x: 2 });
      expect(win.getCell(2, 0).char).toBe('A');
      expect(win.getCell(3, 0).char).toBe('B');
      expect(win.getCell(2, 1).char).toBe('C');
      expect(win.getCell(3, 1).char).toBe('D');
    });

    it('wide characters in segments occupy two consecutive cells', () => {
      win.writeText([
        { text: 'a' },
        { text: '日', attrs: { foreground: 196 } },
        { text: 'b' },
      ], { style: 0 });
      expect(win.getCell(0, 0).char).toBe('a');
      expect(win.getCell(1, 0).char).toBe('日');
      expect(win.getCell(1, 0).attributes.foreground).toBe(196);
      expect(win.getCell(2, 0).char).toBe('');
      expect(win.getCell(2, 0).attributes.foreground).toBe(196);
      expect(win.getCell(3, 0).char).toBe('b');
    });

    it('segments are clipped at the inner boundary like plain writeText', () => {
      const narrow = new Window({ pos: new Pos(0, 0), size: new Size(3, 2) });
      narrow.writeText([
        { text: 'ABCDE' },
      ]);
      expect(narrow.getCell(0, 0).char).toBe('A');
      expect(narrow.getCell(2, 0).char).toBe('C');
      // 'D' and 'E' are clipped; nothing to verify beyond not throwing.
    });
  });

  describe('writeMarkup()', () => {
    let reg: StyleRegistry;
    let win: Window;

    beforeEach(() => {
      reg = new StyleRegistry();
      setRegistry(reg);
      win = new Window({ pos: new Pos(0, 0), size: new Size(30, 3) });
    });

    it('applies named styles from the registry inline', () => {
      reg.registerNamed('err',   { foreground: 196, bold: true });
      reg.registerNamed('muted', { foreground: 244, dim: true });
      win.writeMarkup('{err}fail{/} {muted}reason{/}', { style: 0 });
      expect(win.getCell(0, 0).char).toBe('f');
      expect(win.getCell(0, 0).attributes.foreground).toBe(196);
      expect(win.getCell(0, 0).attributes.bold).toBe(true);
      expect(win.getCell(4, 0).char).toBe(' ');
      expect(win.getCell(5, 0).char).toBe('r');
      expect(win.getCell(5, 0).attributes.foreground).toBe(244);
      expect(win.getCell(5, 0).attributes.dim).toBe(true);
    });

    it('falls back to base style for unknown names', () => {
      const baseId = reg.register({ foreground: 252 });
      win.writeMarkup('{unknown}text{/}', { style: baseId });
      expect(win.getCell(0, 0).char).toBe('t');
      expect(win.getCell(0, 0).attributes.foreground).toBe(252);
    });

    it('{{ and }} are treated as literal braces', () => {
      win.writeMarkup('{{x}}', { style: 0 });
      expect(win.getCell(0, 0).char).toBe('{');
      expect(win.getCell(1, 0).char).toBe('x');
      expect(win.getCell(2, 0).char).toBe('}');
    });

    it('supports nested tags; {/} closes the most recently opened', () => {
      reg.registerNamed('red',  { foreground: 196 });
      reg.registerNamed('bold', { bold: true });
      win.writeMarkup('{red}a{bold}b{/}c{/}', { style: 0 });
      expect(win.getCell(0, 0).attributes.foreground).toBe(196);
      expect(win.getCell(0, 0).attributes.bold).toBeUndefined();
      expect(win.getCell(1, 0).attributes.foreground).toBe(196);
      expect(win.getCell(1, 0).attributes.bold).toBe(true);
      expect(win.getCell(2, 0).attributes.foreground).toBe(196);
      expect(win.getCell(2, 0).attributes.bold).toBeUndefined();
    });

    it('allows built-in names with a colon in the tag', () => {
      win.writeMarkup('{builtin:text-focused}hi{/}', { style: 0 });
      const focusedId = reg.getNamed('builtin:text-focused')!;
      expect(win.getCell(0, 0).attributes).toEqual(reg.get(focusedId));
    });
  });

  describe('extended border styles', () => {
    beforeEach(() => {
      setRegistry(new StyleRegistry());
    });

    it('thick style uses heavy box-drawing characters', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, right: true, bottom: true, left: true, style: 'thick' } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('┏');
      expect(win.getCell(4, 0).char).toBe('┓');
      expect(win.getCell(0, 3).char).toBe('┗');
      expect(win.getCell(4, 3).char).toBe('┛');
      expect(win.getCell(2, 0).char).toBe('━');
      expect(win.getCell(0, 1).char).toBe('┃');
    });

    it('dashed style uses dashed lines with light corners', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, right: true, bottom: true, left: true, style: 'dashed' } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('┌');
      expect(win.getCell(2, 0).char).toBe('╌');
      expect(win.getCell(0, 1).char).toBe('╎');
    });

    it('ascii style uses + for corners and -|', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, right: true, bottom: true, left: true, style: 'ascii' } });
      win.render();
      expect(win.getCell(0, 0).char).toBe('+');
      expect(win.getCell(4, 0).char).toBe('+');
      expect(win.getCell(0, 3).char).toBe('+');
      expect(win.getCell(4, 3).char).toBe('+');
      expect(win.getCell(2, 0).char).toBe('-');
      expect(win.getCell(0, 1).char).toBe('|');
    });

    it("style 'none' draws nothing and consumes no inner space", () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 4), border: { top: true, right: true, bottom: true, left: true, style: 'none' } });
      win.render();
      expect(win.getCell(0, 0).char).toBe(' ');
      expect(win.getCell(4, 3).char).toBe(' ');
      expect(win.getInnerOffset()).toEqual({ x: 0, y: 0 });
      expect(win.getInnerSize()).toEqual({ width: 5, height: 4 });
    });

    it('chars override replaces individual glyphs while keeping the rest of the style', () => {
      const win = new Window({
        pos: new Pos(0, 0),
        size: new Size(5, 4),
        border: { top: true, right: true, bottom: true, left: true, style: 'single', chars: { topLeft: '◆', topRight: '◆' } },
      });
      win.render();
      // overridden corners
      expect(win.getCell(0, 0).char).toBe('◆');
      expect(win.getCell(4, 0).char).toBe('◆');
      // bottom corners untouched (still inherited from 'single')
      expect(win.getCell(0, 3).char).toBe('└');
      expect(win.getCell(4, 3).char).toBe('┘');
      // edges untouched
      expect(win.getCell(2, 0).char).toBe('─');
    });

    it('P0-8: setVisible(false) makes render a no-op and getCell throw', () => {
      const reg = new StyleRegistry();
      setRegistry(reg);
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 3), background: reg.register({ background: 123 }) });
      expect(win.isVisible()).toBe(true);

      win.setVisible(false);
      expect(win.isVisible()).toBe(false);

      // render() must be a no-op while hidden — the region stays blank and
      // getCell() signals the invalid access.
      expect(() => { win.render(); }).not.toThrow();
      expect(() => win.getCell(0, 0)).toThrow(/hidden/);

      // Becoming visible again restores paint + getCell.
      win.setVisible(true);
      win.render();
      expect(win.getCell(0, 0).char).toBe(' ');
      expect(win.getCell(0, 0).attributes.background).toBe(123);
    });

    it('P0-8: hidden child is skipped during parent render()', () => {
      const reg = new StyleRegistry();
      setRegistry(reg);
      const bg = reg.register({ background: 17 });
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 4), background: bg });
      const child  = new Window({ pos: new Pos(2, 1), size: new Size(4, 2), background: reg.register({ background: 200 }) });
      parent.addChild(child);

      parent.render();
      // Visible child overrides the parent background in its area.
      expect(parent.getCell(2, 1).attributes.background).toBe(200);

      child.setVisible(false);
      parent.render();
      // Hidden child leaves the parent background untouched.
      expect(parent.getCell(2, 1).attributes.background).toBe(17);
    });

    it('chars override can swap horizontal and vertical glyphs', () => {
      const win = new Window({
        pos: new Pos(0, 0),
        size: new Size(5, 4),
        border: { top: true, right: true, bottom: true, left: true, style: 'single', chars: { horizontal: '═', vertical: '║' } },
      });
      win.render();
      expect(win.getCell(2, 0).char).toBe('═');
      expect(win.getCell(0, 1).char).toBe('║');
      // corners stay 'single'
      expect(win.getCell(0, 0).char).toBe('┌');
    });
  });

  describe('padding option', () => {
    it('uniform padding shrinks inner area on every side', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), padding: 2 });
      expect(win.getInnerSize()  ).toEqual({ width: 16, height: 6 });
      expect(win.getInnerOffset()).toEqual({ x: 2, y: 2 });
    });

    it('per-side record applies each value independently', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(20, 10),
        padding: { top: 1, right: 2, bottom: 3, left: 4 } });
      expect(win.getInnerSize()  ).toEqual({ width: 14, height: 6 });
      expect(win.getInnerOffset()).toEqual({ x: 4, y: 1 });
    });

    it('stacks on top of the border inset', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), border: true, padding: 2 });
      // border: 1 on each side; padding: 2 on each side → inset = 3
      expect(win.getInnerSize()  ).toEqual({ width: 14, height: 4 });
      expect(win.getInnerOffset()).toEqual({ x: 3, y: 3 });
    });

    it('positions absolute-layout children inside the padded area', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 10), padding: 2 });
      const child  = new Window({ pos: new Pos(0, 0), size: new Size(3, 3) });
      child.fill('P');
      parent.addChild(child);
      parent.render();
      // child should land at (2, 2) — the padded inner offset
      expect(parent.getCell(2, 2).char).toBe('P');
      expect(parent.getCell(4, 4).char).toBe('P');
    });
  });

  describe('flex layout – row', () => {
    it('three grow=1 flex children share inner width evenly', () => {
      const reg = new StyleRegistry();
      setRegistry(reg);
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      const c = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      expect(a.getSize()).toEqual({ width: 10, height: 5 });
      expect(b.getSize()).toEqual({ width: 10, height: 5 });
      expect(c.getSize()).toEqual({ width: 10, height: 5 });
      expect(a.x).toBe(0);
      expect(b.x).toBe(10);
      expect(c.x).toBe(20);
    });

    it('distributes leftover after absolute siblings among grow children', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const fixed = new Window({ pos: Pos.flex(), size: new Size(10, 3) });
      const rest  = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(fixed);
      parent.addChild(rest);
      expect(fixed.getSize()).toEqual({ width: 10, height: 3 });
      expect(rest.getSize() ).toEqual({ width: 20, height: 5 });
      expect(rest.x).toBe(10);
    });

    it('honours gap between children', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 5), layout: 'row', gap: 2 });
      const a = new Window({ pos: Pos.flex(), size: new Size(5, 3) });
      const b = new Window({ pos: Pos.flex(), size: new Size(5, 3) });
      parent.addChild(a);
      parent.addChild(b);
      expect(a.x).toBe(0);
      expect(b.x).toBe(5 + 2);
    });

    it('grow shares leftover in the declared ratio', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const a = new Window({ pos: Pos.flex(), size: new Size(flex(1), flex()) });
      const b = new Window({ pos: Pos.flex(), size: new Size(flex(2), flex()) });
      parent.addChild(a);
      parent.addChild(b);
      // 30 leftover split 1:2 → 10 / 20, last flex gets truncation remainder if any
      expect(a.getSize().width).toBe(10);
      expect(b.getSize().width).toBe(20);
    });

    it('content() measures the child natural size', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const auto  = new Window({ pos: Pos.flex(), size: new Size(content(), content()) });
      const grow  = new Window({ pos: Pos.flex(), size: Size.flex() });
      // declare a non-default natural width via setSize before addChild
      auto.setSize(7, 2);
      parent.addChild(auto);
      parent.addChild(grow);
      expect(auto.getSize().width).toBe(7);
      expect(grow.getSize().width).toBe(23);
    });

    it('Pos.flex(order) sorts children independently of addChild order', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const a = new Window({ pos: Pos.flex(2), size: new Size(5, 3) }); a.fill('A');
      const b = new Window({ pos: Pos.flex(1), size: new Size(5, 3) }); b.fill('B');
      const c = new Window({ pos: Pos.flex(0), size: new Size(5, 3) }); c.fill('C');
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      parent.render();
      // after sort by order: c (0), b (1), a (2)
      expect(parent.getCell(0,  0).char).toBe('C');
      expect(parent.getCell(5,  0).char).toBe('B');
      expect(parent.getCell(10, 0).char).toBe('A');
    });

    it('alignItems stretch expands content children on cross axis', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), layout: 'row', alignItems: 'stretch' });
      const child  = new Window({ pos: Pos.flex(), size: new Size(5, content()) });
      parent.addChild(child);
      expect(child.getSize()).toEqual({ width: 5, height: 10 });
    });

    it('alignItems center places child in the middle of the cross axis', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), layout: 'row', alignItems: 'center' });
      const child  = new Window({ pos: Pos.flex(), size: new Size(5, 2) });
      parent.addChild(child);
      // cross free = 10 - 2 = 8 → centered at y = 4
      expect(child.y).toBe(4);
    });

    it('justifyContent end pushes children to the right when no grow child soaks up slack', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 5), layout: 'row', justifyContent: 'end' });
      const child  = new Window({ pos: Pos.flex(), size: new Size(5, 3) });
      parent.addChild(child);
      expect(child.x).toBe(15);
    });

    it('justifyContent space-between distributes slack between children', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 5), layout: 'row', justifyContent: 'space-between' });
      const a = new Window({ pos: Pos.flex(), size: new Size(5, 3) });
      const b = new Window({ pos: Pos.flex(), size: new Size(5, 3) });
      parent.addChild(a);
      parent.addChild(b);
      expect(a.x).toBe(0);
      expect(b.x).toBe(15);
    });

    it('padding shrinks the area available to flex children', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), layout: 'row', padding: 1 });
      const child  = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(child);
      // inner area = 18 × 8; child stretches to 18 × 8 and sits at (1, 1)
      expect(child.getSize()).toEqual({ width: 18, height: 8 });
      expect(child.x).toBe(1);
      expect(child.y).toBe(1);
    });

    it('setSize reflows every flex child', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      parent.setSize(60, 8);
      expect(a.getSize()).toEqual({ width: 30, height: 8 });
      expect(b.getSize()).toEqual({ width: 30, height: 8 });
      expect(b.x).toBe(30);
    });

    it('invisible children are skipped by the layout engine', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      const c = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      b.setVisible(false);
      // need to re-run layout; setVisible doesn't trigger, but setSize does
      parent.setSize(30, 5);
      expect(a.getSize().width).toBe(15);
      expect(c.getSize().width).toBe(15);
      expect(c.x).toBe(15);
    });
  });

  describe('flex layout – column', () => {
    it('stacks children vertically and shares leftover height', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 30), layout: 'column' });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      expect(a.getSize()).toEqual({ width: 10, height: 15 });
      expect(b.getSize()).toEqual({ width: 10, height: 15 });
      expect(a.y).toBe(0);
      expect(b.y).toBe(15);
    });

    it('honours gap on the main axis (height)', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 20), layout: 'column', gap: 3 });
      const a = new Window({ pos: Pos.flex(), size: new Size(10, 4) });
      const b = new Window({ pos: Pos.flex(), size: new Size(10, 4) });
      parent.addChild(a);
      parent.addChild(b);
      expect(a.y).toBe(0);
      expect(b.y).toBe(4 + 3);
    });
  });

  describe('grid layout', () => {
    it('splits inner area into equal cells row-major', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), layout: 'grid', gridColumns: 2 });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      const c = new Window({ pos: Pos.flex(), size: Size.flex() });
      const d = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      parent.addChild(d);
      // cells 10 × 5
      expect(a.getSize()).toEqual({ width: 10, height: 5 });
      expect(a.x).toBe(0);  expect(a.y).toBe(0);
      expect(b.x).toBe(10); expect(b.y).toBe(0);
      expect(c.x).toBe(0);  expect(c.y).toBe(5);
      expect(d.x).toBe(10); expect(d.y).toBe(5);
    });

    it('honours gap between cells', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(22, 12), layout: 'grid', gridColumns: 2, gap: 2 });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      const c = new Window({ pos: Pos.flex(), size: Size.flex() });
      const d = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      parent.addChild(d);
      // cells (22 - 2)/2 = 10 wide, (12 - 2)/2 = 5 high
      expect(a.getSize()).toEqual({ width: 10, height: 5 });
      expect(b.x).toBe(10 + 2);
      expect(c.y).toBe(5 + 2);
      expect(d.x).toBe(10 + 2);
      expect(d.y).toBe(5 + 2);
    });
  });

  describe('flex layout – rendering', () => {
    it('children render at their computed flex positions', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 3), layout: 'row' });
      const a = new Window({ pos: Pos.flex(), size: Size.flex() }); a.fill('A');
      const b = new Window({ pos: Pos.flex(), size: Size.flex() }); b.fill('B');
      parent.addChild(a);
      parent.addChild(b);
      // refill after resize — addChild's runLayout replaced the regions
      a.fill('A');
      b.fill('B');
      parent.render();
      expect(parent.getCell(0,  1).char).toBe('A');
      expect(parent.getCell(9,  1).char).toBe('A');
      expect(parent.getCell(10, 1).char).toBe('B');
      expect(parent.getCell(19, 1).char).toBe('B');
    });

    it('absolute layout still respects Pos.right() etc. (back-compat)', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 5) });
      const child  = new Window({ pos: Pos.right(), size: new Size(5, 3) });
      child.fill('R');
      parent.addChild(child);
      parent.render();
      expect(parent.getCell(15, 0).char).toBe('R');
      expect(parent.getCell(19, 0).char).toBe('R');
    });
  });

  // ── zIndex (P1-17) ──────────────────────────────────────────────────────────
  describe('zIndex / stacking order', () => {
    beforeEach(() => setRegistry(new StyleRegistry()));

    it('defaults zIndex to 0 and reports it via getZIndex()', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(5, 3) });
      expect(w.getZIndex()).toBe(0);
    });

    it('higher zIndex sibling paints over a lower one at the overlap cell', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
      const low  = new Window({ pos: new Pos(0, 0), size: new Size(6, 1), zIndex: 0 });
      const high = new Window({ pos: new Pos(2, 0), size: new Size(6, 1), zIndex: 5 });
      low.fill('L');
      high.fill('H');
      parent.addChild(low);
      parent.addChild(high);
      parent.render();
      expect(parent.getCell(0, 0).char).toBe('L');
      expect(parent.getCell(3, 0).char).toBe('H'); // inside overlap
      expect(parent.getCell(7, 0).char).toBe('H');
    });

    it('insertion-later sibling wins when zIndex is tied', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(6, 1) });
      const a = new Window({ pos: new Pos(0, 0), size: new Size(4, 1) });
      const b = new Window({ pos: new Pos(2, 0), size: new Size(4, 1) });
      a.fill('A');
      b.fill('B');
      parent.addChild(a);
      parent.addChild(b);
      parent.render();
      expect(parent.getCell(3, 0).char).toBe('B');
    });

    it('setZIndex flips the stacking order at the next render()', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(6, 1) });
      const a = new Window({ pos: new Pos(0, 0), size: new Size(4, 1) });
      const b = new Window({ pos: new Pos(2, 0), size: new Size(4, 1) });
      a.fill('A');
      b.fill('B');
      parent.addChild(a);
      parent.addChild(b);
      a.setZIndex(10);
      parent.render();
      expect(parent.getCell(3, 0).char).toBe('A');
    });
  });

  // ── onFocus / onBlur (P1-22) ────────────────────────────────────────────────
  describe('onFocus / onBlur hooks', () => {
    beforeEach(() => setRegistry(new StyleRegistry()));

    it('fires onFocus exactly once on false → true', () => {
      let count = 0;
      const w = new Window({ pos: new Pos(0, 0), size: new Size(3, 1), onFocus: () => { count++; } });
      w.setFocused(true);
      w.setFocused(true);
      expect(count).toBe(1);
    });

    it('fires onBlur on true → false and not on redundant calls', () => {
      let blurs = 0;
      const w = new Window({ pos: new Pos(0, 0), size: new Size(3, 1), focused: true, onBlur: () => { blurs++; } });
      w.setFocused(false);
      w.setFocused(false);
      expect(blurs).toBe(1);
    });

    it('setOnFocus installs a handler at runtime', () => {
      let called = false;
      const w = new Window({ pos: new Pos(0, 0), size: new Size(3, 1) });
      w.setOnFocus(() => { called = true; });
      w.setFocused(true);
      expect(called).toBe(true);
    });
  });

  // ── Error boundary (P1-23) ─────────────────────────────────────────────────
  describe('error boundary in render()', () => {
    beforeEach(() => setRegistry(new StyleRegistry()));

    it('re-throws when no global error handler is installed', () => {
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(10, 3) });
      class Boom extends Window {
        public override render(): void { throw new Error('boom'); }
      }
      const bad = new Boom({ pos: new Pos(0, 0), size: new Size(5, 1) });
      parent.addChild(bad);
      expect(() => parent.render()).toThrow(/boom/);
    });
  });

  // ── id accessors ───────────────────────────────────────────────────────────
  describe('id accessors', () => {
    it('getId returns the value passed to WindowProperties.id', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(3, 1), id: 'hello' });
      expect(w.getId()).toBe('hello');
    });

    it('setId changes the id at runtime', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(3, 1) });
      w.setId('foo');
      expect(w.getId()).toBe('foo');
      w.setId(undefined);
      expect(w.getId()).toBeUndefined();
    });
  });

  describe('margin option', () => {
    it('default margin is zero on every side', () => {
      setRegistry(new StyleRegistry());
      const w = new Window({ pos: new Pos(0, 0), size: new Size(5, 5) });
      expect(w.getMargin()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('normalises a uniform number to every side', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(5, 5), margin: 3 });
      expect(w.getMargin()).toEqual({ top: 3, right: 3, bottom: 3, left: 3 });
    });

    it('normalises a [vertical, horizontal] tuple', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(5, 5), margin: [1, 4] });
      expect(w.getMargin()).toEqual({ top: 1, right: 4, bottom: 1, left: 4 });
    });

    it('normalises a partial per-side record', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(5, 5), margin: { top: 2, left: 1 } });
      expect(w.getMargin()).toEqual({ top: 2, right: 0, bottom: 0, left: 1 });
    });

    it('does not affect the window inner area (margin is outer)', () => {
      const w = new Window({ pos: new Pos(0, 0), size: new Size(10, 6), margin: 2 });
      expect(w.getInnerSize()).toEqual({ width: 10, height: 6 });
      expect(w.getInnerOffset()).toEqual({ x: 0, y: 0 });
    });

    it('shifts child position in absolute layout by (marginLeft, marginTop)', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
      const child  = new Window({ pos: new Pos(3, 2), size: new Size(4, 3), margin: { top: 1, left: 2 } });
      parent.addChild(child);
      expect(child.x).toBe(3 + 2);
      expect(child.y).toBe(2 + 1);
    });

    it('charges main-axis margin against flex remainder (row layout)', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(30, 5), layout: 'row' });
      const a = new Window({ pos: Pos.flex(), size: Size.flex(), margin: { left: 2, right: 3 } });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      // 30 total - 5 (a's main margin) = 25 distributed between two grow=1 → 12 / 13 (last takes leftover)
      expect(a.getSize().width).toBe(12);
      expect(b.getSize().width).toBe(13);
      expect(a.x).toBe(2);                 // 0 + marginLeft
      expect(b.x).toBe(2 + 12 + 3);        // after a's slot (inner + marginLeft + marginRight)
    });

    it('reduces cross-axis stretch by margin (column layout)', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 20), layout: 'column' });
      const child  = new Window({ pos: Pos.flex(), size: new Size(content(), 6), margin: { left: 3, right: 2 } });
      parent.addChild(child);
      expect(child.getSize()).toEqual({ width: 20 - 3 - 2, height: 6 });
      expect(child.x).toBe(3);
      expect(child.y).toBe(0);
    });

    it('respects margin plus gap between flex siblings', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 5), layout: 'row', gap: 1 });
      const a = new Window({ pos: Pos.flex(), size: new Size(4, 3), margin: { right: 2 } });
      const b = new Window({ pos: Pos.flex(), size: new Size(4, 3) });
      parent.addChild(a);
      parent.addChild(b);
      expect(a.x).toBe(0);
      // a inner (4) + a marginRight (2) + gap (1) = 7 → b.x = 7
      expect(b.x).toBe(4 + 2 + 1);
    });

    it('stacks on top of padding without affecting inner area', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), padding: 1, layout: 'row' });
      const child  = new Window({ pos: Pos.flex(), size: Size.flex(), margin: 1 });
      parent.addChild(child);
      // parent inner 18 x 8; child loses 2 on each axis → 16 x 6, offset (1+1, 1+1)
      expect(child.getSize()).toEqual({ width: 16, height: 6 });
      expect(child.x).toBe(2);
      expect(child.y).toBe(2);
    });

    it('shrinks cell area in grid layout and offsets by margin', () => {
      setRegistry(new StyleRegistry());
      const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10), layout: 'grid', gridColumns: 2 });
      const a = new Window({ pos: Pos.flex(), size: Size.flex(), margin: 1 });
      const b = new Window({ pos: Pos.flex(), size: Size.flex() });
      parent.addChild(a);
      parent.addChild(b);
      // cellW = 10, cellH = 10. a loses 2 on each axis → 8 x 8 at (1, 1).
      expect(a.getSize()).toEqual({ width: 8, height: 8 });
      expect(a.x).toBe(1);
      expect(a.y).toBe(1);
      // b sits at cell (1, 0) at full cell size.
      expect(b.getSize()).toEqual({ width: 10, height: 10 });
      expect(b.x).toBe(10);
      expect(b.y).toBe(0);
    });
  });
});
