import type { Cell, StyleId, BorderStyle, BorderChars, WindowBorder, WindowProperties, WriteTextOptions, WriteTextInput, WriteTextSegment, TerminalSize, LayoutMode, AlignItems, JustifyContent, Padding, PaddingSpec, Margin, MarginSpec, DimSpec, DirtyRect } from './types.mjs';
import { BUILTIN_TEXT, BUILTIN_TEXT_FOCUSED, BUILTIN_TEXT_DISABLED, BUILTIN_BORDER, BUILTIN_BORDER_FOCUSED, BUILTIN_BORDER_DISABLED } from './types.mjs';
import { Region } from './Region.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { getRegistry } from './RegistryHolder.mjs';
import { getErrorHandler } from './ErrorHolder.mjs';
import { charWidth, stringWidth } from './textWidth.mjs';
import type { Pos } from './Pos.mjs';
import { Size } from './Size.mjs';

/** Glyph table for each visual border style. The 'none' style is handled
 *  separately (paintBorder bails out early), so it does not appear here. */
const BORDER_CHARS: Record<Exclude<BorderStyle, 'none'>, Required<BorderChars>> = {
	single:  { horizontal: '─', vertical: '│', topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
	           verticalLeft: '┤', verticalRight: '├', horizontalTop: '┴', horizontalBottom: '┬', cross: '┼' },
	double:  { horizontal: '═', vertical: '║', topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
	           verticalLeft: '╣', verticalRight: '╠', horizontalTop: '╩', horizontalBottom: '╦', cross: '╬' },
	rounded: { horizontal: '─', vertical: '│', topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
	           verticalLeft: '┤', verticalRight: '├', horizontalTop: '┴', horizontalBottom: '┬', cross: '┼' },
	thick:   { horizontal: '━', vertical: '┃', topLeft: '┏', topRight: '┓', bottomLeft: '┗', bottomRight: '┛',
	           verticalLeft: '┫', verticalRight: '┣', horizontalTop: '┻', horizontalBottom: '┳', cross: '╋' },
	dashed:  { horizontal: '╌', vertical: '╎', topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
	           verticalLeft: '┤', verticalRight: '├', horizontalTop: '┴', horizontalBottom: '┬', cross: '┼' },
	ascii:   { horizontal: '-', vertical: '|', topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
	           verticalLeft: '+', verticalRight: '+', horizontalTop: '+', horizontalBottom: '+', cross: '+' },
};

/** Resolves a border option (true / object / false) to a full WindowBorder or false. */
const resolveBorder = (border: WindowBorder | boolean | undefined): WindowBorder | false => {
	if (!border) return false;
	if (border === true) return { top: true, right: true, bottom: true, left: true };
	return border;
};

/** Internal per-child bookkeeping during a row/column flex layout pass. */
interface FlexItem {
	child:     Window;
	mainSpec:  DimSpec;
	crossSpec: DimSpec;
	mainSize:  number;
	crossSize: number;
}

/** Resolves a flex-item's initial main- or cross-axis size from its DimSpec.
 *  - 'abs'     → the literal pixel value.
 *  - 'pct'     → the computed fraction of the parent's inner dimension.
 *  - 'flex'    → the basis (abs or pct of parent) before grow/shrink distribution.
 *  - 'content' → the child's natural size (its current Region dimension on the
 *                requested axis), which defaults to 1 for an uninitialised child.
 *  `naturalSize` must come from the child's current getSize() on the relevant
 *  axis so content-sized children pick up the most up-to-date measurement. */
function resolveFlexBasis(spec: DimSpec, parent: number, naturalSize: number): number {
	switch (spec.mode) {
		case 'abs':     return spec.value;
		case 'pct':     return Math.floor(parent * spec.value / 100);
		case 'content': return naturalSize;
		case 'flex':
			return spec.basis.kind === 'pct'
				? Math.floor(parent * spec.basis.value / 100)
				: spec.basis.value;
	}
}

/** Normalises a PaddingSpec to a full Padding record (missing sides → 0). */
const resolvePadding = (spec: PaddingSpec | undefined): Padding => {
	if (spec === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
	if (typeof spec === 'number') return { top: spec, right: spec, bottom: spec, left: spec };
	if (Array.isArray(spec)) {
		const [v = 0, h = 0] = spec;
		return { top: v, right: h, bottom: v, left: h };
	}
	return {
		top:    spec.top    ?? 0,
		right:  spec.right  ?? 0,
		bottom: spec.bottom ?? 0,
		left:   spec.left   ?? 0,
	};
};

/** Normalises a MarginSpec to a full Margin record (missing sides → 0).
 *  Shares the PaddingSpec shape so the two helpers are interchangeable. */
const resolveMargin = (spec: MarginSpec | undefined): Margin => {
	if (spec === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
	if (typeof spec === 'number') return { top: spec, right: spec, bottom: spec, left: spec };
	if (Array.isArray(spec)) {
		const [v = 0, h = 0] = spec;
		return { top: v, right: h, bottom: v, left: h };
	}
	return {
		top:    spec.top    ?? 0,
		right:  spec.right  ?? 0,
		bottom: spec.bottom ?? 0,
		left:   spec.left   ?? 0,
	};
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
	/** Whether this window participates in rendering. When false, the window's own
	 *  render() is a no-op, its region is not blitted onto the parent, and
	 *  `getCell()` throws. Focus-cycle in WindowManager skips invisible focusable
	 *  controls. Default: true. */
	private visible: boolean = true;
	/** Layout algorithm applied to direct children. 'absolute' keeps the pre-flex
	 *  behaviour; 'row' / 'column' / 'grid' activate the flex engine. */
	private layoutMode: LayoutMode;
	/** Spacing (in cells) between adjacent children for flex / grid layouts. */
	private gap: number;
	/** Padding applied inside the border (in addition to the border inset).
	 *  Influences `getInnerSize()` / `getInnerOffset()`. */
	private padding: Padding;
	/** Outer spacing reserved around this window inside its parent's layout.
	 *  Consumed by the parent's layout engine (absolute/flex/grid); does not
	 *  influence this window's inner area. */
	private margin: Margin;
	/** Number of columns for `layout: 'grid'`. */
	private gridColumns: number;
	/** Cross-axis alignment for row/column layouts. */
	private alignItems: AlignItems;
	/** Main-axis distribution of leftover space when no flex-grow child consumes it. */
	private justifyContent: JustifyContent;
	/** Optional identifier — copied from WindowProperties.id. Used by
	 *  `WindowManager.focusById` and by diagnostic tooling. */
	private id: string | undefined;
	/** Stacking order among siblings (higher z renders on top). Default: 0. */
	private zIndex: number;
	/** Fires once when focused state flips from false to true. */
	private onFocusHandler: (() => void) | undefined;
	/** Fires once when focused state flips from true to false. */
	private onBlurHandler: (() => void) | undefined;
	/** Parent window (set by `addChild`, cleared by `removeChild`). Damage
	 *  tracking walks up this chain to notify the root `Screen` of geometry
	 *  or topology changes that need a full repaint. */
	protected parent: Window | null = null;
	/** Accumulated dirty region in this window's local coordinates.
	 *  - `null`  — nothing changed since the last emit.
	 *  - `'all'` — the whole window area needs to be re-emitted.
	 *  - `DirtyRect` — bounding box of localised writes; `markDirty()` eagerly
	 *    unions new rects so we only ever carry one rect per window.
	 *  Windows start as `'all'` so the very first frame re-emits every cell. */
	protected dirtyRect: DirtyRect | 'all' | null = 'all';
	/** Depth of nested `Window.render()` calls currently executing. Increments
	 *  at the top of every `render()` and decrements in a `finally`, so
	 *  controls whose `render()` override re-writes content via `this.clear()`
	 *  / `this.writeText(...)` do not re-mark themselves dirty every frame —
	 *  render-time writes deterministically rebuild the display buffer from
	 *  existing state, so marking them as "user-driven dirty" would defeat the
	 *  "skip frame when nothing changed" optimisation. */
	protected static renderingDepth: number = 0;

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
		this.layoutMode     = wp.layout         ?? 'absolute';
		this.gap            = wp.gap            ?? 0;
		this.padding        = resolvePadding(wp.padding);
		this.margin         = resolveMargin(wp.margin);
		this.gridColumns    = Math.max(1, wp.gridColumns ?? 1);
		this.alignItems     = wp.alignItems     ?? 'stretch';
		this.justifyContent = wp.justifyContent ?? 'start';
		this.id             = wp.id;
		this.zIndex         = wp.zIndex ?? 0;
		this.onFocusHandler = wp.onFocus;
		this.onBlurHandler  = wp.onBlur;

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

	// ── Damage tracking ─────────────────────────────────────────────────────

	/** Marks this window (or a sub-rectangle in its local coordinates) as
	 *  dirty. Subsequent `Screen.render()` calls emit ANSI only for cells
	 *  inside the collected dirty rects, skipping untouched regions. When
	 *  `rect` is omitted, the entire window is flagged. Render-time writes
	 *  are ignored so controls' `render()` overrides do not re-mark
	 *  themselves every frame. Safe to call many times between renders —
	 *  new rects are unioned into the existing bounding box. */
	public markDirty(rect?: DirtyRect): void {
		if (Window.renderingDepth > 0) return;
		if (this.dirtyRect === 'all') return;
		if (rect === undefined) { this.dirtyRect = 'all'; return; }
		if (rect.w <= 0 || rect.h <= 0) return;
		if (this.dirtyRect === null) {
			this.dirtyRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
			return;
		}
		const ax0 = this.dirtyRect.x;
		const ay0 = this.dirtyRect.y;
		const ax1 = ax0 + this.dirtyRect.w;
		const ay1 = ay0 + this.dirtyRect.h;
		const bx0 = rect.x;
		const by0 = rect.y;
		const bx1 = bx0 + rect.w;
		const by1 = by0 + rect.h;
		const nx0 = Math.min(ax0, bx0);
		const ny0 = Math.min(ay0, by0);
		const nx1 = Math.max(ax1, bx1);
		const ny1 = Math.max(ay1, by1);
		this.dirtyRect = { x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 };
	}

	/** Convenience alias — flags the entire window as dirty. Equivalent to
	 *  calling `markDirty()` with no argument; kept as a named entry point
	 *  so custom controls can invalidate themselves without depending on
	 *  the default-argument behaviour. */
	public invalidate(): void {
		this.markDirty();
	}

	/** Walks the parent chain up to the root window. Damage tracking uses
	 *  this to bubble a full-invalidation signal to the root `Screen` when
	 *  geometry or tree topology changes, because the cells previously
	 *  occupied by a now-moved / resized / hidden window need to be repainted
	 *  from the content underneath them. `Screen` overrides it to toggle its
	 *  internal full-repaint flag; plain `Window`s forward the call up. */
	protected markFullInvalidation(): void {
		this.parent?.markFullInvalidation();
	}

	/** Appends this window's dirty rect (translated into screen coordinates
	 *  via the running offset) and every descendant's dirty rects to `acc`.
	 *  Hidden subtrees are skipped — invisible windows don't contribute to
	 *  the emit phase, and any state change that flips visibility already
	 *  escalated to a full invalidation so the vacated area repaints. */
	protected collectDirtyRects(offsetX: number, offsetY: number, acc: DirtyRect[]): void {
		if (!this.visible) return;
		if (this.dirtyRect === 'all') {
			const { width, height } = this.getSize();
			acc.push({ x: offsetX, y: offsetY, w: width, h: height });
		} else if (this.dirtyRect !== null) {
			acc.push({
				x: offsetX + this.dirtyRect.x,
				y: offsetY + this.dirtyRect.y,
				w: this.dirtyRect.w,
				h: this.dirtyRect.h,
			});
		}
		for (const child of this.children) {
			child.collectDirtyRects(offsetX + child.x, offsetY + child.y, acc);
		}
	}

	/** Clears the dirty flag on this window and every descendant. Called by
	 *  `Screen.render()` after the emit phase so the next frame starts from
	 *  a clean slate. */
	protected clearDirtyRecursive(): void {
		this.dirtyRect = null;
		for (const child of this.children) child.clearDirtyRecursive();
	}

	/** Returns a snapshot of the resolved per-side margin (in cells). The parent's
	 *  layout engine reads this to reserve outer spacing around the child. */
	public getMargin(): Readonly<Margin> {
		return { ...this.margin };
	}

	/** Returns the number of cells consumed by decorations on each edge.
	 *  The explicit 'none' border style is treated as no border (no insets). */
	private borderInset(): { top: number; right: number; bottom: number; left: number } {
		const b = this.border;
		if (!b || b.style === 'none') return { top: 0, right: 0, bottom: 0, left: 0 };
		return {
			top:    (b.top    ?? false) ? 1 : 0,
			right:  (b.right  ?? false) ? 1 : 0,
			bottom: (b.bottom ?? false) ? 1 : 0,
			left:   (b.left   ?? false) ? 1 : 0,
		};
	}

	/** Returns the combined per-side inset (border + padding) that defines the
	 *  inner content area. Padding stacks on top of the border inset. */
	private innerInset(): Padding {
		const b = this.borderInset();
		return {
			top:    b.top    + this.padding.top,
			right:  b.right  + this.padding.right,
			bottom: b.bottom + this.padding.bottom,
			left:   b.left   + this.padding.left,
		};
	}

	/** Returns the top-left offset of the content area, accounting for
	 *  decorations (border) and layout insets (padding). */
	public getInnerOffset(): { x: number; y: number } {
		const { left, top } = this.innerInset();
		return { x: left, y: top };
	}

	/** Returns the dimensions of the content area, accounting for decorations
	 *  (border) and layout insets (padding). */
	public getInnerSize(): TerminalSize {
		const { width, height } = this.getSize();
		const { top, right, bottom, left } = this.innerInset();
		return {
			width:  Math.max(0, width  - left - right),
			height: Math.max(0, height - top  - bottom),
		};
	}

	/** Sets the active state. Affects border and background appearance on next render(). */
	public setActive(active: boolean): void {
		if (this.active === active) return;
		this.active = active;
		this.markDirty();
	}

	/** Sets the focused state. Controls use this to change visual appearance on focus.
	 *  Fires `onFocus` / `onBlur` (configured via `WindowProperties`) when the state
	 *  actually changes; a no-op call with the current value does not re-fire them. */
	public setFocused(focused: boolean): void {
		if (this.focused === focused) return;
		this.focused = focused;
		this.markDirty();
		if (focused) this.onFocusHandler?.();
		else         this.onBlurHandler?.();
	}

	/** Registers (or replaces) the onFocus handler at runtime. Pass `undefined`
	 *  to detach. Fires in `setFocused` on every false → true transition. */
	public setOnFocus(handler: (() => void) | undefined): void {
		this.onFocusHandler = handler;
	}

	/** Registers (or replaces) the onBlur handler at runtime. Pass `undefined`
	 *  to detach. Fires in `setFocused` on every true → false transition. */
	public setOnBlur(handler: (() => void) | undefined): void {
		this.onBlurHandler = handler;
	}

	/** Returns the optional identifier set via WindowProperties.id. */
	public getId(): string | undefined {
		return this.id;
	}

	/** Sets (or clears with `undefined`) the window identifier used by
	 *  `WindowManager.focusById` and diagnostic tooling. */
	public setId(id: string | undefined): void {
		this.id = id;
	}

	/** Returns the current stacking order. Higher values render on top of
	 *  lower ones among siblings. Default: 0. */
	public getZIndex(): number {
		return this.zIndex;
	}

	/** Updates the stacking order. Siblings are re-sorted on the next render()
	 *  call; call `screen.render()` (or the surrounding window) to see the
	 *  change. Does not affect layout (flex/absolute coordinates are
	 *  independent of z). */
	public setZIndex(zIndex: number): void {
		if (this.zIndex === zIndex) return;
		this.zIndex = zIndex;
		// Re-stacking can expose or occlude any cell inside the parent's
		// bounds — escalate to a full repaint so the neighbour(s) underneath
		// get re-emitted along with this window.
		this.markFullInvalidation();
		this.markDirty();
	}

	/** Returns the direct children of this window in insertion order (a
	 *  read-only view). WindowManager uses this to walk subtrees for
	 *  `trapFocus` and `focusById` without exposing the internal array. */
	public getChildren(): readonly Window[] {
		return this.children;
	}

	/** Returns whether this window currently has keyboard focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state and deactivates the window when disabled. */
	public setDisabled(disabled: boolean): void {
		if (this.disabled !== disabled) this.markDirty();
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether this window is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
	}

	/** Shows or hides the window. A hidden window does not paint itself, is not
	 *  blitted onto its parent, and its focusable descendants are skipped by
	 *  `WindowManager.moveFocus / setFocus`. Toggling visibility does not mutate
	 *  the content buffer — previously written cells reappear verbatim on the
	 *  next render after the window is shown again. */
	public setVisible(visible: boolean): void {
		if (this.visible === visible) return;
		this.visible = visible;
		// Showing / hiding a window changes what the root Screen emits in this
		// window's old bounds (the parent below may need to repaint, or the
		// new reveal needs its first emit). Full invalidation is the
		// conservative, always-correct choice.
		this.markFullInvalidation();
		this.markDirty();
	}

	/** Returns whether this window is currently visible. Default: true. */
	public isVisible(): boolean {
		return this.visible;
	}

	/** Sets the label text displayed by the control. */
	public setLabel(label: string): void {
		if (this.label === label) return;
		this.label = label;
		this.markDirty();
	}

	/** Returns the current label text. */
	public getLabel(): string {
		return this.label;
	}

	/** Updates the border configuration. Effective on the next render() call.
	 *  Intended for use by subclasses that need dynamic decoration (e.g. focus-state colour). */
	protected updateBorder(border: WindowBorder | boolean | undefined): void {
		this.border = resolveBorder(border);
		this.markDirty();
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

	/** Adds a child window. The final position and (for non-absolute sizes) the
	 *  final dimensions are computed by the parent's layout engine: in
	 *  'absolute' layout each child resolves its own Pos/Size; in 'row',
	 *  'column', or 'grid' layouts the engine distributes the inner area
	 *  across every visible child. Re-laying out on addChild keeps sibling
	 *  geometry consistent when more children join the stack. */
	public addChild(child: Window): void {
		this.children.push(child);
		child.parent = this;
		this.runLayout();
		// Newly attached subtrees may overlap existing cells, and their own
		// `dirtyRect` already defaults to `'all'` — but the parent region that
		// may be exposed by later removal needs a correct baseline on the root
		// Screen side, so we bubble a full invalidation for the first frame.
		this.markFullInvalidation();
	}

	/** Returns a resolved Cell (char + CellAttributes) at (x, y) from the display buffer.
	 *  Throws RangeError if out of bounds. Throws Error when the window is
	 *  currently hidden (setVisible(false)) — callers should check isVisible()
	 *  first when the visibility state is uncertain. */
	public getCell(x: number, y: number): Cell {
		if (!this.visible) {
			throw new Error('Window.getCell called on a hidden window (setVisible(false))');
		}
		const char       = this.region.getChars()[this.flatIndex(x, y)];
		const styleId    = this.region.getStyleId(x, y);
		const attributes = { ...this.registry.get(styleId) };
		return { char, attributes };
	}

	/** Sets only the character at (x, y) without modifying the style ID. Throws RangeError if out of bounds. */
	public setChar(x: number, y: number, char: string): void {
		this.content.setChar(x, y, char);
		this.region.setChar(x, y, char);
		this.markDirty({ x, y, w: 1, h: 1 });
	}

	/** Sets the character and style ID at (x, y). Throws RangeError if out of bounds. */
	public setCell(x: number, y: number, char: string, styleId: StyleId = 0): void {
		this.content.setCell(x, y, char, styleId);
		this.region.setCell(x, y, char, styleId);
		this.markDirty({ x, y, w: 1, h: 1 });
	}

	/** Merges the given style ID onto the existing style at (x, y) without changing the character.
	 *  Throws RangeError if out of bounds. */
	public mergeStyle(x: number, y: number, styleId: StyleId): void {
		const mergedContent = this.registry.merge(this.content.getStyleId(x, y), styleId);
		const mergedRegion  = this.registry.merge(this.region.getStyleId(x, y),  styleId);
		this.content.setStyleId(x, y, mergedContent);
		this.region.setStyleId(x, y,  mergedRegion);
		this.markDirty({ x, y, w: 1, h: 1 });
	}

	/** Resets every cell to a blank space with style ID 0. */
	public clear(): void {
		this.content.clear();
		this.region.clear();
		this.markDirty();
	}

	/** Fills every cell with the given character and style ID. */
	public fill(char: string, styleId: StyleId = 0): void {
		this.content.fill(char, styleId);
		this.region.fill(char, styleId);
		this.markDirty();
	}

	/** Writes text into the window's content area starting at (x, y) (default 0, 0).
	 *  Coordinates are relative to the inner content area (i.e. decorations such as borders are excluded).
	 *
	 *  Accepts either a plain string (one base style for the whole text) or an array of
	 *  `WriteTextSegment`s so inline rich text can be laid out without separate writeText()
	 *  calls — the cursor flows from one segment into the next on the same row. Each segment
	 *  may pin its own style either as a pre-registered `style: StyleId` or as inline
	 *  `attrs: CellAttributes` (registered on the fly). The segment style is merged on top
	 *  of the base style so global defaults (e.g. foreground) keep applying unless overridden.
	 *
	 *  Behaviour shared with the single-string form:
	 *  - Newline characters move to the next row, resetting x to startX.
	 *  - Characters outside the inner bounds are silently clipped.
	 *  - Wide characters (CJK, emoji, double-width NerdFonts) occupy two consecutive cells;
	 *    the second cell stores '' as a continuation sentinel so terminal cursor advancement
	 *    during render() stays aligned with the buffer indices. Wide chars whose right half
	 *    would overflow the inner area are skipped entirely.
	 *  - Zero-width codepoints (combining marks, format chars, control chars) are skipped.
	 *  - When no style is provided, the base style is auto-picked from disabled / focused /
	 *    normal state. Pass `options.style = 0` to suppress the state-based base style. */
	public writeText(input: WriteTextInput, options?: WriteTextOptions): void {
		const { x: ox, y: oy } = this.getInnerOffset();
		const { width: iw, height: ih } = this.getInnerSize();
		const startX = (options?.x ?? 0) + ox;
		const startY = (options?.y ?? 0) + oy;
		const baseStyle = options?.style ?? (
			this.disabled ? this.disabledStyleId :
			this.focused  ? this.focusedStyleId  :
			this.normalStyleId
		);
		const segments: WriteTextSegment[] = typeof input === 'string'
			? [{ text: input }]
			: input;

		let cx = startX;
		let cy = startY;
		for (const seg of segments) {
			let segId: StyleId = baseStyle;
			if (seg.style !== undefined) {
				segId = this.registry.merge(baseStyle, seg.style);
			} else if (seg.attrs !== undefined) {
				segId = this.registry.merge(baseStyle, this.registry.register(seg.attrs));
			}
			for (const ch of seg.text) {
				if (ch === '\n') {
					cx = startX;
					cy++;
					continue;
				}
				const w = charWidth(ch.codePointAt(0)!);
				if (w === 0) continue;
				const inRow = cy >= oy && cy < oy + ih;
				if (w === 2) {
					if (inRow && cx >= ox && cx + 1 < ox + iw) {
						this.setCell(cx,     cy, ch, segId);
						this.setCell(cx + 1, cy, '',  segId);
					}
				} else {
					if (inRow && cx >= ox && cx < ox + iw) {
						this.setCell(cx, cy, ch, segId);
					}
				}
				cx += w;
			}
		}
	}

	/** Writes a template that embeds named styles from the StyleRegistry.
	 *  Syntax is a mini-markup: `{name}…{/}` wraps an inline region in the style
	 *  registered under `name` (e.g. a built-in name like `builtin:text-focused` or a
	 *  user-registered custom name). Nested tags inherit attributes from their parent
	 *  — the inner style is merged on top of the outer one, so `{red}a{bold}b{/}c{/}`
	 *  renders `a` in red, `b` in red+bold, `c` in red. `{/}` closes the most recently
	 *  opened tag. Unknown names keep the surrounding style unchanged. `{{` and `}}`
	 *  escape literal braces. The template is compiled to an array of
	 *  `WriteTextSegment`s and written via writeText(), so line-wrap, width, and
	 *  clipping rules are inherited. */
	public writeMarkup(template: string, options?: WriteTextOptions): void {
		const segments: WriteTextSegment[] = [];
		const stack: StyleId[] = [];
		let buf = '';
		const flush = (): void => {
			if (buf.length === 0) return;
			const top = stack[stack.length - 1];
			segments.push(top !== undefined ? { text: buf, style: top } : { text: buf });
			buf = '';
		};
		let i = 0;
		while (i < template.length) {
			const ch = template[i]!;
			if (ch === '{' && template[i + 1] === '{') { buf += '{'; i += 2; continue; }
			if (ch === '}' && template[i + 1] === '}') { buf += '}'; i += 2; continue; }
			if (ch === '{') {
				const close = template.indexOf('}', i + 1);
				if (close === -1) { buf += ch; i++; continue; }
				const tag = template.slice(i + 1, close);
				flush();
				if (tag === '/') {
					stack.pop();
				} else {
					const id = this.registry.getNamed(tag);
					const top = stack[stack.length - 1] ?? 0;
					const composed = id !== undefined ? this.registry.merge(top, id) : top;
					stack.push(composed);
				}
				i = close + 1;
				continue;
			}
			buf += ch;
			i++;
		}
		flush();
		this.writeText(segments, options);
	}

	/** Returns the display width (in terminal cells) of a string,
	 *  honouring wide characters (CJK, emoji, double-width NerdFonts) and
	 *  ignoring zero-width codepoints. Useful for sizing labels or aligning
	 *  text in custom controls. */
	public getTextWidth(text: string): number {
		return stringWidth(text);
	}

	/**
	 * Builds the display buffer: background → user content → border → children.
	 * The result is stored in region and used by blitChild / Screen.render().
	 * A hidden window (setVisible(false)) returns immediately so neither its
	 * own paint stages nor its children contribute to the frame; hidden
	 * children are also skipped in the loop below.
	 */
	public render(): void {
		if (!this.visible) return;
		Window.renderingDepth++;
		try {
			this.syncBorderColor();
			this.paintBackground();
			this.blitContent();
			this.paintBorder();
			for (const child of this.orderedByZ()) {
				if (!child.visible) continue;
				try {
					child.render();
					this.blitChild(child);
				} catch (err) {
					this.paintErrorPlaceholder(child, err);
					const handler = getErrorHandler();
					if (handler) handler(err, child);
					else         throw err;
				}
			}
		} finally {
			Window.renderingDepth--;
		}
	}

	/** Returns direct children sorted for rendering — stable by (zIndex asc,
	 *  insertion order). Children with higher zIndex paint last, so they
	 *  appear on top of lower-z siblings. Layout is NOT affected: flex and
	 *  absolute positioning run off the insertion-ordered `children` list. */
	private orderedByZ(): Window[] {
		if (this.children.length < 2) return this.children;
		const stable = this.children.map((child, idx) => ({ child, idx }));
		stable.sort((a, b) => (a.child.zIndex - b.child.zIndex) || (a.idx - b.idx));
		return stable.map(e => e.child);
	}

	/** Renders a single-line "⚠ render error" marker over the child's
	 *  pre-allocated region so a broken subtree never blanks the rest of the
	 *  frame. The child is still blitted onto this window so its geometry
	 *  (borders, siblings) remains visible in the debug layout. */
	private paintErrorPlaceholder(child: Window, err: unknown): void {
		const { width, height } = child.getSize();
		if (width === 0 || height === 0) return;
		const styleId = this.registry.register({ foreground: 196, background: 52, bold: true });
		try {
			child.region = new Region(width, height);
			child.region.fill(' ', styleId);
			const message = err instanceof Error ? err.message : String(err);
			const prefix = '⚠ render error: ';
			const maxLen = Math.max(0, width - prefix.length);
			const text = prefix + message.slice(0, maxLen);
			const chars = [...text];
			for (let i = 0; i < chars.length && i < width; i++) {
				child.region.setCell(i, 0, chars[i]!, styleId);
			}
			this.blitChild(child);
		} catch {
			// Swallow — the placeholder itself must not throw further.
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

	/** Draws border characters on the display buffer edges. When inactive, adds dim to border cells.
	 *  Uses the glyph table for `border.style`, with optional per-character overrides
	 *  via `border.chars`. The 'none' style is a no-op placeholder. */
	private paintBorder(): void {
		if (!this.border) return;
		const b = this.border;
		const style = b.style ?? 'single';
		if (style === 'none') return;
		const { width, height } = this.region.getSize();
		if (width < 2 && height < 2) return;
		const baseChars = BORDER_CHARS[style];
		const chars: Required<BorderChars> = b.chars ? { ...baseChars, ...b.chars } : baseChars;

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
				if (isLeft  && left)  ch = chars.topLeft;
				else if (isRight && right) ch = chars.topRight;
				else ch = chars.horizontal;
				this.region.setCell(x, 0, ch, baseId);
			}
		}

		// bottom row
		if (bottom && height >= 2) {
			for (let x = 0; x < width; x++) {
				const isLeft  = x === 0;
				const isRight = x === width - 1;
				let ch: string;
				if (isLeft  && left)  ch = chars.bottomLeft;
				else if (isRight && right) ch = chars.bottomRight;
				else ch = chars.horizontal;
				this.region.setCell(x, height - 1, ch, baseId);
			}
		}

		// left column (skip corners already drawn)
		if (left && width >= 1) {
			const rowStart = top    ? 1 : 0;
			const rowEnd   = bottom ? height - 2 : height - 1;
			for (let y = rowStart; y <= rowEnd; y++) {
				this.region.setCell(0, y, chars.vertical, baseId);
			}
		}

		// right column (skip corners already drawn)
		if (right && width >= 2) {
			const rowStart = top    ? 1 : 0;
			const rowEnd   = bottom ? height - 2 : height - 1;
			for (let y = rowStart; y <= rowEnd; y++) {
				this.region.setCell(width - 1, y, chars.vertical, baseId);
			}
		}
	}

	/** Copies a child's display buffer onto this window's display buffer,
	 *  clipping to this window's bounds. Styles are transferred from the child's
	 *  registry into this window's registry. The child's (x, y) was computed by
	 *  the layout engine on addChild / reflowChildren / setSize, so blit can
	 *  read it directly — this keeps absolute and flex paths on the same code. */
	private blitChild(child: Window): void {
		const chars         = child.region.getChars();
		const childStyleIds = child.region.getStyleIds();
		const { width: cw, height: ch } = child.getSize();
		const ax = child.x;
		const ay = child.y;
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
		if (idx !== -1) {
			this.children.splice(idx, 1);
			child.parent = null;
			// The vacated rectangle has to be re-emitted from the content
			// underneath — escalate so the root Screen repaints everything.
			this.markFullInvalidation();
		}
	}

	/** Replaces both internal regions with new ones of the given dimensions,
	 *  then re-resolves sizes and positions of all direct children against the updated inner area. */
	protected resizeRegions(w: number, h: number): void {
		this.region  = new Region(w, h);
		this.content = new Region(w, h);
		// A new region invalidates any per-cell dirty bookkeeping from the
		// previous size — escalate to a full-window repaint and ask the
		// Screen to emit from scratch because the old footprint on stdout
		// may include cells that are no longer part of this window.
		this.dirtyRect = 'all';
		this.markFullInvalidation();
		this.reflowChildren();
	}

	/** Resizes this window to the given absolute dimensions and reflows every
	 *  descendant whose size or position is percentage-based against the new
	 *  inner area. Existing absolute children keep their declared geometry but
	 *  have their stored x/y refreshed by reflowChildren() so the parent's
	 *  border insets still apply. The previously written content is discarded
	 *  — callers that need to preserve it must redraw after setSize(). */
	public setSize(width: number, height: number): void {
		this.resizeRegions(width, height);
	}

	/** Re-resolves sizes and absolute positions for every direct child against
	 *  the current inner area. Delegates to the layout engine so percentage
	 *  children, flex children, and grid cells are all updated from the same
	 *  code path. Called after this window is resized or a new child is added. */
	private reflowChildren(): void {
		this.runLayout();
	}

	/** Runs the layout engine against the current inner area. Dispatches to
	 *  absolute / row / column / grid implementations based on `layoutMode`. */
	private runLayout(): void {
		const { width: pw, height: ph } = this.getInnerSize();
		const { x: ox, y: oy }          = this.getInnerOffset();
		switch (this.layoutMode) {
			case 'absolute': this.layoutAbsolute(pw, ph, ox, oy); return;
			case 'row':
			case 'column':   this.layoutFlex(this.layoutMode, pw, ph, ox, oy); return;
			case 'grid':     this.layoutGrid(pw, ph, ox, oy); return;
		}
	}

	/** Absolute layout: each child independently resolves its Pos/Size against
	 *  the parent's inner area — the pre-flex behaviour. A child's `margin`
	 *  shifts the resolved position by `(marginLeft, marginTop)` without
	 *  altering its size, so callers can push a window away from its declared
	 *  anchor without recomputing coordinates by hand. */
	private layoutAbsolute(pw: number, ph: number, ox: number, oy: number): void {
		for (const child of this.children) {
			if (!child.sizeSpec.isAbsolute()) {
				const { w, h } = child.sizeSpec.resolve(pw, ph);
				child.resizeRegions(w, h);
			}
			const { width: cw, height: ch } = child.getSize();
			const { x, y } = child.posSpec.resolve(pw, ph, cw, ch);
			child.x = x + ox + child.margin.left;
			child.y = y + oy + child.margin.top;
		}
	}

	/** Row / column flex layout. The main axis (width for 'row', height for
	 *  'column') is distributed across children: each child starts with its
	 *  basis (abs → value, pct → fraction of parent, flex → flex basis,
	 *  content → measured natural size), then remaining slack is distributed
	 *  pro rata by `grow`, and negative slack by `shrink`. The cross axis is
	 *  aligned via `alignItems` — 'stretch' expands flex/content children to
	 *  the full inner cross dimension. `justifyContent` governs leftover
	 *  distribution only when no child consumes slack via flex-grow. Invisible
	 *  children are skipped so `setVisible(false)` effectively removes them
	 *  from the stack. Children are ordered by `Pos.flex(order)` first, then
	 *  by addChild insertion (stable).
	 *
	 *  Each child's `margin` reserves extra cells around it: the main axis
	 *  loses `marginLeft+marginRight` (row) or `marginTop+marginBottom` (column)
	 *  per child before distribution, and the cross axis loses `margin*` per
	 *  child before alignment. Grow/shrink still apply to the inner size so the
	 *  declared margin stays constant even when the child is flex-resized. */
	private layoutFlex(mode: 'row' | 'column', pw: number, ph: number, ox: number, oy: number): void {
		const ordered = this.orderedVisibleChildren();
		if (ordered.length === 0) return;
		const isRow = mode === 'row';
		const mainParent  = isRow ? pw : ph;
		const crossParent = isRow ? ph : pw;
		const gap = this.gap;

		// Per-child main/cross margin totals captured up-front so they stay
		// constant across grow/shrink passes.
		const mainMargin  = (c: Window): number => isRow ? c.margin.left + c.margin.right  : c.margin.top  + c.margin.bottom;
		const crossMargin = (c: Window): number => isRow ? c.margin.top  + c.margin.bottom : c.margin.left + c.margin.right;

		// First pass: basis sizes per child (inner, i.e. the child's own region
		// without margin). Natural size is taken before margin so content-sized
		// children keep their intrinsic footprint.
		const items = ordered.map((c): FlexItem => {
			const mainSpec  = isRow ? c.sizeSpec.getWidthSpec()  : c.sizeSpec.getHeightSpec();
			const crossSpec = isRow ? c.sizeSpec.getHeightSpec() : c.sizeSpec.getWidthSpec();
			return {
				child:     c,
				mainSpec,
				crossSpec,
				mainSize:  resolveFlexBasis(mainSpec,  mainParent,  isRow ? c.getSize().width  : c.getSize().height),
				crossSize: resolveFlexBasis(crossSpec, crossParent, isRow ? c.getSize().height : c.getSize().width),
			};
		});

		// Distribute leftover main-axis space. The parent sees each child's
		// slot as `mainSize + mainMargin`, so margins are charged against the
		// remaining space before grow/shrink.
		const totalGap = Math.max(0, items.length - 1) * gap;
		const totalMargin = items.reduce((s, it) => s + mainMargin(it.child), 0);
		const totalMain = items.reduce((s, it) => s + it.mainSize, 0);
		let remainder = mainParent - totalMain - totalMargin - totalGap;
		const totalGrow = items.reduce((s, it) => s + (it.mainSpec.mode === 'flex' ? it.mainSpec.grow : 0), 0);
		if (remainder > 0 && totalGrow > 0) {
			let distributed = 0;
			for (const it of items) {
				if (it.mainSpec.mode !== 'flex') continue;
				const share = Math.floor(remainder * (it.mainSpec.grow / totalGrow));
				it.mainSize += share;
				distributed += share;
			}
			// Hand the integer-truncation leftover to the last flex child.
			const leftover = remainder - distributed;
			if (leftover > 0) {
				for (let i = items.length - 1; i >= 0; i--) {
					if (items[i]!.mainSpec.mode === 'flex') { items[i]!.mainSize += leftover; break; }
				}
			}
			remainder = 0;
		} else if (remainder < 0) {
			const totalShrink = items.reduce((s, it) => s + (it.mainSpec.mode === 'flex' ? it.mainSpec.shrink : 0), 0);
			if (totalShrink > 0) {
				for (const it of items) {
					if (it.mainSpec.mode !== 'flex') continue;
					const take = Math.ceil(Math.abs(remainder) * (it.mainSpec.shrink / totalShrink));
					it.mainSize = Math.max(0, it.mainSize - take);
				}
				const consumed = items.reduce((s, it) => s + it.mainSize, 0);
				remainder = mainParent - consumed - totalMargin - totalGap;
			}
		}

		// Apply cross-axis stretch where allowed. Cross-axis margin is charged
		// before stretch/clamp so a stretched child + its margin fits within
		// crossParent.
		for (const it of items) {
			const cm = crossMargin(it.child);
			const available = Math.max(0, crossParent - cm);
			const mode = it.crossSpec.mode;
			if (this.alignItems === 'stretch' && mode !== 'abs' && mode !== 'pct') {
				it.crossSize = available;
			} else {
				it.crossSize = Math.min(it.crossSize, available);
			}
		}

		// justifyContent kicks in only when there is positive slack with no grow.
		let mainStart   = 0;
		let itemSpacing = gap;
		if (remainder > 0) {
			switch (this.justifyContent) {
				case 'center':         mainStart = Math.floor(remainder / 2); break;
				case 'end':            mainStart = remainder; break;
				case 'space-between':
					if (items.length > 1) itemSpacing = gap + Math.floor(remainder / (items.length - 1));
					break;
				case 'space-around':
					if (items.length > 0) {
						const pad = Math.floor(remainder / (items.length * 2));
						mainStart   = pad;
						itemSpacing = gap + pad * 2;
					}
					break;
			}
		}

		// Write final sizes and positions. The child's main-axis starting
		// coordinate is `cursor + marginLeading`; cursor then advances by
		// `mainSize + mainMargin + itemSpacing` so the next slot is offset by
		// this child's full footprint.
		let cursor = mainStart;
		for (const it of items) {
			const mainSize  = Math.max(0, it.mainSize);
			const crossSize = Math.max(0, it.crossSize);
			const newW = isRow ? mainSize : crossSize;
			const newH = isRow ? crossSize : mainSize;
			if (newW !== it.child.getSize().width || newH !== it.child.getSize().height) {
				it.child.resizeRegions(newW, newH);
			}
			const m = it.child.margin;
			const mainLead  = isRow ? m.left : m.top;
			const mainTrail = isRow ? m.right : m.bottom;
			const crossLead = isRow ? m.top  : m.left;
			const cm = crossMargin(it.child);
			let crossPos = 0;
			if (this.alignItems !== 'stretch') {
				const free = Math.max(0, crossParent - crossSize - cm);
				if      (this.alignItems === 'center') crossPos = Math.floor(free / 2);
				else if (this.alignItems === 'end')    crossPos = free;
			}
			if (isRow) {
				it.child.x = ox + cursor + mainLead;
				it.child.y = oy + crossPos + crossLead;
			} else {
				it.child.x = ox + crossPos + crossLead;
				it.child.y = oy + cursor + mainLead;
			}
			cursor += mainSize + mainLead + mainTrail + itemSpacing;
		}
	}

	/** Grid layout: children are placed row-major into equally sized cells.
	 *  Each cell's width is `(innerWidth - gap * (cols - 1)) / cols` (floored);
	 *  heights use the same formula with the derived row count. Children are
	 *  resized to the cell dimensions minus their own margin and positioned
	 *  at the cell's top-left offset by `(marginLeft, marginTop)`. Invisible
	 *  children are skipped. */
	private layoutGrid(pw: number, ph: number, ox: number, oy: number): void {
		const ordered = this.orderedVisibleChildren();
		if (ordered.length === 0) return;
		const cols = this.gridColumns;
		const rows = Math.max(1, Math.ceil(ordered.length / cols));
		const gap = this.gap;
		const cellW = Math.max(0, Math.floor((pw - gap * Math.max(0, cols - 1)) / cols));
		const cellH = Math.max(0, Math.floor((ph - gap * Math.max(0, rows - 1)) / rows));
		for (let i = 0; i < ordered.length; i++) {
			const child = ordered[i]!;
			const c = i % cols;
			const r = Math.floor(i / cols);
			const m = child.margin;
			const innerW = Math.max(0, cellW - m.left - m.right);
			const innerH = Math.max(0, cellH - m.top  - m.bottom);
			if (innerW !== child.getSize().width || innerH !== child.getSize().height) {
				child.resizeRegions(innerW, innerH);
			}
			child.x = ox + c * (cellW + gap) + m.left;
			child.y = oy + r * (cellH + gap) + m.top;
		}
	}

	/** Returns visible children sorted by Pos.flex(order) ascending; children
	 *  without Pos.flex default to order 0. Stable w.r.t. addChild insertion. */
	private orderedVisibleChildren(): Window[] {
		const visible = this.children.filter(c => c.visible);
		const withIndex = visible.map((child, idx) => ({
			child,
			order: child.posSpec.getFlexOrder() ?? 0,
			idx,
		}));
		withIndex.sort((a, b) => (a.order - b.order) || (a.idx - b.idx));
		return withIndex.map(e => e.child);
	}

	/** Returns the flat index for (x, y) in the region buffer (used by getCell). */
	private flatIndex(x: number, y: number): number {
		return y * this.region.getSize().width + x;
	}
}
