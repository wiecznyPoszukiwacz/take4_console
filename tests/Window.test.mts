import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from '../src/Screen/Window.mjs';
import { StyleRegistry } from '../src/Screen/StyleRegistry.mjs';
import { setRegistry } from '../src/Screen/RegistryHolder.mjs';
import { Pos } from '../src/Screen/Pos.mjs';
import { Size } from '../src/Screen/Size.mjs';

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
});
