import type { ListBoxProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** A scrollable list of single-line items. The selected item is highlighted and may
 *  be moved with arrow keys, PgUp/PgDn, and Home/End. Emits onChange whenever the
 *  selection index changes via keyboard. Appearance follows the same built-in style
 *  naming scheme as the other focusable controls. */
export class ListBox extends Window {
	private items: string[];
	private selectedIndex: number;
	private scrollTop: number;
	private onChange?: (index: number, item: string) => void;
	private selectedStyleId:  StyleId;
	private focusedSelStyle:  StyleId;

	/** Creates a ListBox from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: ListBoxProperties) {
		super({
			...wp,
			defaultBorder: { top: true, right: true, bottom: true, left: true, style: 'single' },
		});

		this.items         = cp?.items ?? [];
		this.onChange      = cp?.onChange;
		this.scrollTop     = 0;
		this.selectedIndex = cp?.selectedIndex ?? (this.items.length > 0 ? 0 : -1);

		// Selected row: muted highlight when unfocused, bright inverse when focused.
		const reg = getRegistry();
		this.selectedStyleId = reg.register({ background: 238, foreground: 252 });
		this.focusedSelStyle = reg.register({ background: 75, foreground: 231, bold: true });
	}

	/** Replaces the list items. Resets selection to 0 (or -1 if empty) and scrolls to top. */
	public setItems(items: string[]): void {
		this.items         = items;
		this.selectedIndex = items.length > 0 ? 0 : -1;
		this.scrollTop     = 0;
	}

	/** Returns the current list items. */
	public getItems(): string[] {
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

	/** Returns the currently selected item string, or undefined when nothing is selected. */
	public getSelectedItem(): string | undefined {
		if (this.selectedIndex < 0 || this.selectedIndex >= this.items.length) return undefined;
		return this.items[this.selectedIndex];
	}

	/** Processes a key press: arrow keys, Home/End, PgUp/PgDn move the selection. */
	public handleKey(key: string): void {
		if (this.disabled || this.items.length === 0) return;

		const prev   = this.selectedIndex;
		const pageSz = Math.max(1, this.getInnerSize().height);

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

	/** Adjusts scrollTop so that the selected index remains within the visible window. */
	private ensureVisible(): void {
		const visibleRows = Math.max(1, this.getInnerSize().height);
		if (this.selectedIndex < this.scrollTop) {
			this.scrollTop = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollTop + visibleRows) {
			this.scrollTop = this.selectedIndex - visibleRows + 1;
		}
		// Clamp scrollTop so we don't leave trailing empty rows unless necessary.
		const maxScroll = Math.max(0, this.items.length - visibleRows);
		this.scrollTop  = Math.max(0, Math.min(maxScroll, this.scrollTop));
	}

	/** Rebuilds the list: renders visible rows with styles. */
	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		if (width < 1 || height < 1) {
			super.render();
			return;
		}

		this.ensureVisible();

		const visibleCount = Math.min(height, this.items.length - this.scrollTop);
		for (let row = 0; row < visibleCount; row++) {
			const itemIndex = this.scrollTop + row;
			const rawText   = this.items[itemIndex];
			// Truncate to fit width; pad with spaces so the highlight covers the whole row.
			const text      = rawText.length > width ? rawText.slice(0, width) : rawText;
			const padded    = text + ' '.repeat(width - text.length);

			let style: StyleId;
			if (this.disabled) {
				style = this.disabledStyleId;
			} else if (itemIndex === this.selectedIndex) {
				style = this.focused ? this.focusedSelStyle : this.selectedStyleId;
			} else {
				style = this.normalStyleId;
			}

			this.writeText(padded, { x: 0, y: row, style });
		}

		super.render();
	}
}
