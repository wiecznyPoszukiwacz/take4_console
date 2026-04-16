import type {
	ListBoxProperties,
	ListBoxRenderContext,
	ListBoxRowSegment,
	ListBoxRowSegments,
	StyleId,
	WindowProperties,
} from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** A scrollable list of items. Generic over the item type T (default: string).
 *  The selected item is highlighted and may be moved with arrow keys, PgUp/PgDn,
 *  and Home/End. Emits onChange whenever the selection index changes via keyboard.
 *  Consumers may customise per-row rendering via `renderItem`, which returns either a
 *  plain string (single left-aligned segment) or an array of styled ListBoxRowSegment
 *  entries supporting `left`/`right`/`fill` alignment. Appearance follows the same
 *  built-in style naming scheme as the other focusable controls. */
export class ListBox<T = string> extends Window {
	private items: T[];
	private selectedIndex: number;
	private scrollTop: number;
	private onChange?: (index: number, item: T) => void;
	private renderItem?: (item: T, ctx: ListBoxRenderContext) => ListBoxRowSegments;
	private rowHeight: number;
	private keyFn?: (item: T) => string;
	private selectedStyleId:  StyleId;
	private focusedSelStyle:  StyleId;

	/** Creates a ListBox from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: ListBoxProperties<T>) {
		super({
			...wp,
			defaultBorder: { top: true, right: true, bottom: true, left: true, style: 'single' },
		});

		this.items         = cp?.items ?? [];
		this.onChange      = cp?.onChange;
		this.renderItem    = cp?.renderItem;
		this.rowHeight     = Math.max(1, cp?.rowHeight ?? 1);
		this.keyFn         = cp?.keyFn;
		this.scrollTop     = 0;
		this.selectedIndex = cp?.selectedIndex ?? (this.items.length > 0 ? 0 : -1);

		// Selected row: muted highlight when unfocused, bright inverse when focused.
		const reg = getRegistry();
		this.selectedStyleId = reg.register({ background: 238, foreground: 252 });
		this.focusedSelStyle = reg.register({ background: 75, foreground: 231, bold: true });
	}

	/** Replaces the list items. Resets selection to 0 (or -1 if empty) and scrolls to top. */
	public setItems(items: T[]): void {
		this.items         = items;
		this.selectedIndex = items.length > 0 ? 0 : -1;
		this.scrollTop     = 0;
	}

	/** Returns the current list items. */
	public getItems(): T[] {
		return this.items;
	}

	/** Sets the selected index. Clamped to valid range; -1 allowed only when items is empty. */
	public setSelectedIndex(index: number): void {
		if (this.items.length === 0) {
			this.selectedIndex = -1;
			return;
		}
		this.selectedIndex = Math.max(0, Math.min(this.items.length - 1, index));
		this.ensureVisible();
	}

	/** Returns the currently selected index, or -1 when the list is empty. */
	public getSelectedIndex(): number {
		return this.selectedIndex;
	}

	/** Returns the currently selected item, or undefined when nothing is selected. */
	public getSelectedItem(): T | undefined {
		if (this.selectedIndex < 0 || this.selectedIndex >= this.items.length) return undefined;
		return this.items[this.selectedIndex];
	}

	/** Replaces the per-row renderer after construction. Pass undefined to restore default behaviour. */
	public setRenderItem(fn: ((item: T, ctx: ListBoxRenderContext) => ListBoxRowSegments) | undefined): void {
		this.renderItem = fn;
	}

	/** Returns the configured row height in cells. */
	public getRowHeight(): number {
		return this.rowHeight;
	}

	/** Returns the stable key for an item, computed via the configured keyFn (falls back to String(item)). */
	public getItemKey(item: T): string {
		return this.keyFn ? this.keyFn(item) : String(item);
	}

	/** Processes a key press: arrow keys, Home/End, PgUp/PgDn move the selection. */
	public handleKey(key: string): void {
		if (this.disabled || this.items.length === 0) return;

		const prev   = this.selectedIndex;
		const pageSz = Math.max(1, this.getVisibleRowCount());

		switch (key) {
			case '\x1b[A': // Up arrow
				this.selectedIndex = Math.max(0, this.selectedIndex - 1);
				break;
			case '\x1b[B': // Down arrow
				this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
				break;
			case '\x1b[H': // Home
			case '\x1b[1~':
				this.selectedIndex = 0;
				break;
			case '\x1b[F': // End
			case '\x1b[4~':
				this.selectedIndex = this.items.length - 1;
				break;
			case '\x1b[5~': // PgUp
				this.selectedIndex = Math.max(0, this.selectedIndex - pageSz);
				break;
			case '\x1b[6~': // PgDn
				this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + pageSz);
				break;
			default:
				return;
		}

		this.ensureVisible();
		if (this.selectedIndex !== prev) {
			this.onChange?.(this.selectedIndex, this.items[this.selectedIndex]);
		}
	}

	/** Returns the number of item slots that fit in the current inner area (>= 1). */
	private getVisibleRowCount(): number {
		return Math.max(1, Math.floor(this.getInnerSize().height / this.rowHeight));
	}

	/** Adjusts scrollTop so that the selected index remains within the visible window. */
	private ensureVisible(): void {
		const visibleRows = this.getVisibleRowCount();
		if (this.selectedIndex < this.scrollTop) {
			this.scrollTop = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollTop + visibleRows) {
			this.scrollTop = this.selectedIndex - visibleRows + 1;
		}
		// Clamp scrollTop so we don't leave trailing empty rows unless necessary.
		const maxScroll = Math.max(0, this.items.length - visibleRows);
		this.scrollTop  = Math.max(0, Math.min(maxScroll, this.scrollTop));
	}

	/** Rebuilds the list: renders visible rows with styles and optional custom renderer. */
	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		if (width < 1 || height < 1) {
			super.render();
			return;
		}

		this.ensureVisible();

		const slotCount    = this.getVisibleRowCount();
		const visibleCount = Math.min(slotCount, this.items.length - this.scrollTop);

		for (let slot = 0; slot < visibleCount; slot++) {
			const itemIndex = this.scrollTop + slot;
			const item      = this.items[itemIndex];
			const topRow    = slot * this.rowHeight;

			// Pick the base row style from the current focus/selection/disabled state.
			const baseStyle = this.pickRowStyle(itemIndex);

			// Paint every row of this slot with the base style so selection highlights span the full slot.
			for (let r = 0; r < this.rowHeight && topRow + r < height; r++) {
				this.writeText(' '.repeat(width), { x: 0, y: topRow + r, style: baseStyle });
			}

			const segments = this.resolveSegments(item, {
				index:    itemIndex,
				focused:  this.focused,
				selected: itemIndex === this.selectedIndex,
				width,
			});

			this.drawRowSegments(topRow, segments, width, baseStyle);
		}

		super.render();
	}

	/** Returns the row-level base style ID for the given item index. */
	private pickRowStyle(itemIndex: number): StyleId {
		if (this.disabled) return this.disabledStyleId;
		if (itemIndex === this.selectedIndex) {
			return this.focused ? this.focusedSelStyle : this.selectedStyleId;
		}
		return this.normalStyleId;
	}

	/** Invokes the configured renderItem (or a default stringifier) and normalises the result into segments. */
	private resolveSegments(item: T, ctx: ListBoxRenderContext): ListBoxRowSegment[] {
		const out: ListBoxRowSegments = this.renderItem
			? this.renderItem(item, ctx)
			: String(item);
		if (typeof out === 'string') {
			return [{ text: out, align: 'left' }];
		}
		return out;
	}

	/** Draws a single row's segments onto the inner area at the given top row. */
	private drawRowSegments(topRow: number, segments: ListBoxRowSegment[], width: number, baseStyle: StyleId): void {
		const left:  ListBoxRowSegment[] = [];
		const right: ListBoxRowSegment[] = [];
		let fill: ListBoxRowSegment | undefined;

		for (const seg of segments) {
			const align = seg.align ?? 'left';
			if (align === 'left')       left.push(seg);
			else if (align === 'right') right.push(seg);
			else if (align === 'fill' && !fill) fill = seg;
		}

		// Render left-aligned segments left-to-right starting at column 0.
		let leftCursor = 0;
		for (const seg of left) {
			if (leftCursor >= width) break;
			const available = width - leftCursor;
			const text      = seg.text.length > available ? seg.text.slice(0, available) : seg.text;
			const style     = this.segmentStyle(seg, baseStyle);
			this.writeText(text, { x: leftCursor, y: topRow, style });
			leftCursor += text.length;
		}

		// Measure right-aligned segments and render them starting at their computed offset.
		let rightWidth = 0;
		for (const seg of right) rightWidth += seg.text.length;
		let rightCursor = Math.max(leftCursor, width - rightWidth);
		for (const seg of right) {
			if (rightCursor >= width) break;
			const available = width - rightCursor;
			const text      = seg.text.length > available ? seg.text.slice(0, available) : seg.text;
			const style     = this.segmentStyle(seg, baseStyle);
			this.writeText(text, { x: rightCursor, y: topRow, style });
			rightCursor += text.length;
		}

		// Render the single fill segment (if any) between the left and right groups.
		if (fill) {
			const fillStart = leftCursor;
			const fillEnd   = Math.max(fillStart, width - rightWidth);
			const fillWidth = fillEnd - fillStart;
			if (fillWidth > 0) {
				const text  = fill.text.length >= fillWidth
					? fill.text.slice(0, fillWidth)
					: fill.text + ' '.repeat(fillWidth - fill.text.length);
				const style = this.segmentStyle(fill, baseStyle);
				this.writeText(text, { x: fillStart, y: topRow, style });
			}
		}
	}

	/** Merges a segment's optional style onto the row's base style, preserving the highlight background. */
	private segmentStyle(seg: ListBoxRowSegment, baseStyle: StyleId): StyleId {
		return seg.style !== undefined ? this.registry.merge(baseStyle, seg.style) : baseStyle;
	}
}
