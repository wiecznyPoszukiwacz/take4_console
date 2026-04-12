import type { Cell, StyleId, BorderStyle, WindowBorder, WindowProperties, WriteTextOptions, TerminalSize } from './types.mjs';
import { BUILTIN_TEXT, BUILTIN_TEXT_FOCUSED, BUILTIN_TEXT_DISABLED, BUILTIN_BORDER, BUILTIN_BORDER_FOCUSED, BUILTIN_BORDER_DISABLED } from './types.mjs';
import { Region } from './Region.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { getRegistry } from './RegistryHolder.mjs';
import type { Pos } from './Pos.mjs';
import { Size } from './Size.mjs';

/** Characters used for each border style. */
const BORDER_CHARS: Record<BorderStyle, { h: string; v: string; tl: string; tr: string; bl: string; br: string }> = {
	single:  { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' },
	double:  { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝' },
	rounded: { h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯' },
};

/** Resolves a border option (true / object / false) to a full WindowBorder or false. */
const resolveBorder = (border: WindowBorder | boolean | undefined): WindowBorder | false => {
	if (!border) return false;
	if (border === true) return { top: true, right: true, bottom: true, left: true };
	return border;
};

export class Window {
	public x: number;
	public y: number;
	/** Composited display buffer – rebuilt by render(); read by blitChild and Screen. */
	protected region: Region;
	/** Global style registry shared by all windows and controls. */
	protected registry: StyleRegistry;
	protected children: Window[];
	/** Whether this window currently has keyboard focus. */
	protected focused: boolean = false;
	/** Whether this window is disabled (inactive and visually dimmed). */
	protected disabled: boolean = false;
	/** Optional text label displayed by the control. */
	protected label: string = '';
	/** Style ID used for normal (default) text rendering. Initialized from BUILTIN_TEXT. */
	protected normalStyleId!: StyleId;
	/** Style ID used when the control is focused. Initialized from BUILTIN_TEXT_FOCUSED. */
	protected focusedStyleId!: StyleId;
	/** Style ID used when the control is disabled. Initialized from BUILTIN_TEXT_DISABLED. */
	protected disabledStyleId!: StyleId;

	/** User-written content – survives render() cycles. */
	private content: Region;
	private background: StyleId;
	private border: WindowBorder | false;
	/** True when the original border config included an explicit color; prevents auto-sync. */
	private borderColorExplicit: boolean = false;
	private active: boolean;
	private posSpec: Pos;
	private sizeSpec: Size;

	/** Creates a window from the given properties.
	 *  For percentage-based sizes, call addChild() before writing content to the window.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties) {
		const pos  = wp.pos;
		const size = wp.size ?? new Size(1, 1);

		this.posSpec  = pos;
		this.sizeSpec = size;
		this.registry = getRegistry();
		this.normalStyleId   = this.registry.getNamed(BUILTIN_TEXT)!;
		this.focusedStyleId  = this.registry.getNamed(BUILTIN_TEXT_FOCUSED)!;
		this.disabledStyleId = this.registry.getNamed(BUILTIN_TEXT_DISABLED)!;
		this.children = [];
		this.focused  = wp.focused ?? false;
		this.disabled = wp.disabled ?? false;
		this.active   = wp.active ?? !this.disabled;
		this.label    = wp.label ?? '';
		this.background = wp.background ?? 0;
		this.border   = resolveBorder(wp.border ?? wp.defaultBorder);
		this.borderColorExplicit = this.border !== false && this.border.color !== undefined;

		const { w, h } = size.isAbsolute() ? size.resolve(0, 0) : { w: 1, h: 1 };
		this.region  = new Region(w, h);
		this.content = new Region(w, h);

		if (pos.isAbsolute()) {
			const abs = pos.resolveAbsolute();
			this.x = abs.x;
			this.y = abs.y;
		} else {
			this.x = 0;
			this.y = 0;
		}
	}

	/** Returns the window dimensions (columns × rows). */
	public getSize(): TerminalSize {
		return this.region.getSize();
	}

	/** Returns the number of cells consumed by decorations on each edge. */
	private borderInset(): { top: number; right: number; bottom: number; left: number } {
		const b = this.border;
		if (!b) return { top: 0, right: 0, bottom: 0, left: 0 };
		return {
			top:    (b.top    ?? false) ? 1 : 0,
			right:  (b.right  ?? false) ? 1 : 0,
			bottom: (b.bottom ?? false) ? 1 : 0,
			left:   (b.left   ?? false) ? 1 : 0,
		};
	}

	/** Returns the top-left offset of the content area, accounting for decorations such as borders. */
	public getInnerOffset(): { x: number; y: number } {
		const { left, top } = this.borderInset();
		return { x: left, y: top };
	}

	/** Returns the dimensions of the content area, accounting for decorations such as borders. */
	public getInnerSize(): TerminalSize {
		const { width, height } = this.getSize();
		const { top, right, bottom, left } = this.borderInset();
		return {
			width:  Math.max(0, width  - left - right),
			height: Math.max(0, height - top  - bottom),
		};
	}

	/** Sets the active state. Affects border and background appearance on next render(). */
	public setActive(active: boolean): void {
		this.active = active;
	}

	/** Sets the focused state. Controls use this to change visual appearance on focus. */
	public setFocused(focused: boolean): void {
		this.focused = focused;
	}

	/** Returns whether this window currently has keyboard focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state and deactivates the window when disabled. */
	public setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether this window is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
	}

	/** Sets the label text displayed by the control. */
	public setLabel(label: string): void {
		this.label = label;
	}

	/** Returns the current label text. */
	public getLabel(): string {
		return this.label;
	}

	/** Updates the border configuration. Effective on the next render() call.
	 *  Intended for use by subclasses that need dynamic decoration (e.g. focus-state colour). */
	protected updateBorder(border: WindowBorder | boolean | undefined): void {
		this.border = resolveBorder(border);
	}

	/** Recomputes the border color from the current focused/disabled state.
	 *  Called automatically at the start of render() so subclasses never need to do it manually.
	 *  Only updates the color when no explicit color was provided in the original border config. */
	private syncBorderColor(): void {
		if (!this.border || this.borderColorExplicit) return;
		this.border.color = this.disabled
			? this.registry.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
			: this.focused
				? this.registry.getNamedForeground(BUILTIN_BORDER_FOCUSED, 75)
				: this.registry.getNamedForeground(BUILTIN_BORDER, 240);
	}

	/** Adds a child window. If the child uses percentage-based sizes they are resolved immediately
	 *  against this window's inner dimensions (excluding decorations such as borders).
	 *  Position is resolved relative to the inner area and stored on child.x/y. */
	public addChild(child: Window): void {
		const { width: pw, height: ph } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();
		if (!child.sizeSpec.isAbsolute()) {
			const { w, h } = child.sizeSpec.resolve(pw, ph);
			child.resizeRegions(w, h);
		}
		const { width: cw, height: ch } = child.getSize();
		const { x, y } = child.posSpec.resolve(pw, ph, cw, ch);
		child.x = x + ox;
		child.y = y + oy;
		this.children.push(child);
	}

	/** Returns a resolved Cell (char + CellAttributes) at (x, y) from the display buffer.
	 *  Throws RangeError if out of bounds. */
	public getCell(x: number, y: number): Cell {
		const char       = this.region.getChars()[this.flatIndex(x, y)];
		const styleId    = this.region.getStyleId(x, y);
		const attributes = { ...this.registry.get(styleId) };
		return { char, attributes };
	}

	/** Sets only the character at (x, y) without modifying the style ID. Throws RangeError if out of bounds. */
	public setChar(x: number, y: number, char: string): void {
		this.content.setChar(x, y, char);
		this.region.setChar(x, y, char);
	}

	/** Sets the character and style ID at (x, y). Throws RangeError if out of bounds. */
	public setCell(x: number, y: number, char: string, styleId: StyleId = 0): void {
		this.content.setCell(x, y, char, styleId);
		this.region.setCell(x, y, char, styleId);
	}

	/** Merges the given style ID onto the existing style at (x, y) without changing the character.
	 *  Throws RangeError if out of bounds. */
	public mergeStyle(x: number, y: number, styleId: StyleId): void {
		const mergedContent = this.registry.merge(this.content.getStyleId(x, y), styleId);
		const mergedRegion  = this.registry.merge(this.region.getStyleId(x, y),  styleId);
		this.content.setStyleId(x, y, mergedContent);
		this.region.setStyleId(x, y,  mergedRegion);
	}

	/** Resets every cell to a blank space with style ID 0. */
	public clear(): void {
		this.content.clear();
		this.region.clear();
	}

	/** Fills every cell with the given character and style ID. */
	public fill(char: string, styleId: StyleId = 0): void {
		this.content.fill(char, styleId);
		this.region.fill(char, styleId);
	}

	/** Writes text into the window's content area starting at (x, y) (default 0, 0).
	 *  Coordinates are relative to the inner content area (i.e. decorations such as borders are excluded).
	 *  Newline characters move to the next row, resetting x to startX.
	 *  Characters outside the inner bounds are silently clipped.
	 *  When no style is provided, automatically picks disabledStyleId, focusedStyleId, or normalStyleId
	 *  based on the current disabled/focused state. */
	public writeText(text: string, options?: WriteTextOptions): void {
		const { x: ox, y: oy } = this.getInnerOffset();
		const { width: iw, height: ih } = this.getInnerSize();
		const startX  = (options?.x ?? 0) + ox;
		const startY  = (options?.y ?? 0) + oy;
		const styleId = options?.style ?? (
			this.disabled ? this.disabledStyleId :
			this.focused  ? this.focusedStyleId  :
			this.normalStyleId
		);
		let cx = startX;
		let cy = startY;
		for (const ch of text) {
			if (ch === '\n') {
				cx = startX;
				cy++;
				continue;
			}
			if (cx >= ox && cx < ox + iw && cy >= oy && cy < oy + ih) {
				this.setCell(cx, cy, ch, styleId);
			}
			cx++;
		}
	}

	/**
	 * Builds the display buffer: background → user content → border → children.
	 * The result is stored in region and used by blitChild / Screen.render().
	 */
	public render(): void {
		this.syncBorderColor();
		this.paintBackground();
		this.blitContent();
		this.paintBorder();
		for (const child of this.children) {
			child.render();
			this.blitChild(child);
		}
	}

	/** Fills the display buffer with the background style. When inactive, adds dim to every cell.
	 *  No-op when background is 0 (transparent). */
	private paintBackground(): void {
		if (this.background === 0) return;
		let bgId = this.background;
		if (!this.active) {
			bgId = this.registry.merge(bgId, this.registry.register({ dim: true }));
		}
		this.region.fill(' ', bgId);
	}

	/** Overlays user-written content onto the display buffer, merging with any background already set. */
	private blitContent(): void {
		const contentChars    = this.content.getChars();
		const contentStyleIds = this.content.getStyleIds();
		const regionStyleIds  = this.region.getStyleIds();
		const { width, height } = this.content.getSize();
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i        = y * width + x;
				const mergedId = this.registry.merge(regionStyleIds[i], contentStyleIds[i]);
				this.region.setCell(x, y, contentChars[i], mergedId);
			}
		}
	}

	/** Draws border characters on the display buffer edges. When inactive, adds dim to border cells. */
	private paintBorder(): void {
		if (!this.border) return;
		const b = this.border;
		const { width, height } = this.region.getSize();
		if (width < 2 && height < 2) return;
		const chars = BORDER_CHARS[b.style ?? 'single'];

		const bgColor = this.background !== 0
			? this.registry.get(this.background).background
			: undefined;

		const baseAttrsParts: import('./types.mjs').CellAttributes = {};
		if (b.color    !== undefined) baseAttrsParts.foreground = b.color;
		if (bgColor    !== undefined) baseAttrsParts.background = bgColor;
		if (!this.active)             baseAttrsParts.dim = true;
		const baseId = this.registry.register(baseAttrsParts);

		const top    = b.top    ?? false;
		const bottom = b.bottom ?? false;
		const left   = b.left   ?? false;
		const right  = b.right  ?? false;

		// top row
		if (top && height >= 1) {
			for (let x = 0; x < width; x++) {
				const isLeft  = x === 0;
				const isRight = x === width - 1;
				let ch: string;
				if (isLeft  && left)  ch = chars.tl;
				else if (isRight && right) ch = chars.tr;
				else ch = chars.h;
				this.region.setCell(x, 0, ch, baseId);
			}
		}

		// bottom row
		if (bottom && height >= 2) {
			for (let x = 0; x < width; x++) {
				const isLeft  = x === 0;
				const isRight = x === width - 1;
				let ch: string;
				if (isLeft  && left)  ch = chars.bl;
				else if (isRight && right) ch = chars.br;
				else ch = chars.h;
				this.region.setCell(x, height - 1, ch, baseId);
			}
		}

		// left column (skip corners already drawn)
		if (left && width >= 1) {
			const rowStart = top    ? 1 : 0;
			const rowEnd   = bottom ? height - 2 : height - 1;
			for (let y = rowStart; y <= rowEnd; y++) {
				this.region.setCell(0, y, chars.v, baseId);
			}
		}

		// right column (skip corners already drawn)
		if (right && width >= 2) {
			const rowStart = top    ? 1 : 0;
			const rowEnd   = bottom ? height - 2 : height - 1;
			for (let y = rowStart; y <= rowEnd; y++) {
				this.region.setCell(width - 1, y, chars.v, baseId);
			}
		}
	}

	/** Copies a child's display buffer onto this window's display buffer, clipping to this window's bounds.
	 *  Styles are transferred from the child's registry into this window's registry.
	 *  Position is re-resolved from the child's Pos spec relative to the inner content area on every render. */
	private blitChild(child: Window): void {
		const chars         = child.region.getChars();
		const childStyleIds = child.region.getStyleIds();
		const { width: cw, height: ch } = child.getSize();
		const { width: pw, height: ph } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();
		const { x: cx, y: cy } = child.posSpec.resolve(pw, ph, cw, ch);
		const ax = cx + ox;
		const ay = cy + oy;
		const { width: totalW, height: totalH } = this.getSize();

		for (let childY = 0; childY < ch; childY++) {
			for (let childX = 0; childX < cw; childX++) {
				const px = ax + childX;
				const py = ay + childY;
				if (px >= 0 && px < totalW && py >= 0 && py < totalH) {
					const i        = childY * cw + childX;
					const attrs    = child.registry.get(childStyleIds[i]);
					const parentId = this.registry.register(attrs);
					this.region.setCell(px, py, chars[i], parentId);
				}
			}
		}
	}

	/** Removes a previously added child window. No-op if the child is not found. */
	public removeChild(child: Window): void {
		const idx = this.children.indexOf(child);
		if (idx !== -1) this.children.splice(idx, 1);
	}

	/** Replaces both internal regions with new ones of the given dimensions,
	 *  then re-resolves sizes and positions of all direct children against the updated inner area. */
	private resizeRegions(w: number, h: number): void {
		this.region  = new Region(w, h);
		this.content = new Region(w, h);
		this.reflowChildren();
	}

	/** Re-resolves sizes and absolute positions for every direct child against the current inner area.
	 *  Called after this window is resized so that percentage-based children get correct dimensions. */
	private reflowChildren(): void {
		const { width: pw, height: ph } = this.getInnerSize();
		const { x: ox, y: oy }          = this.getInnerOffset();
		for (const child of this.children) {
			if (!child.sizeSpec.isAbsolute()) {
				const { w, h } = child.sizeSpec.resolve(pw, ph);
				child.resizeRegions(w, h);
			}
			const { width: cw, height: ch } = child.getSize();
			const { x, y } = child.posSpec.resolve(pw, ph, cw, ch);
			child.x = x + ox;
			child.y = y + oy;
		}
	}

	/** Returns the flat index for (x, y) in the region buffer (used by getCell). */
	private flatIndex(x: number, y: number): number {
		return y * this.region.getSize().width + x;
	}
}
