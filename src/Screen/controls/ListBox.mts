import type { ListBoxOptions, StyleId } from '../types.mjs';
import {
	BUILTIN_WINDOW_BG,
	BUILTIN_BORDER,
	BUILTIN_BORDER_FOCUSED,
	BUILTIN_BORDER_DISABLED,
	BUILTIN_TEXT,
	BUILTIN_TEXT_DISABLED,
} from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** A scrollable list of single-line items. The selected item is highlighted and may
 *  be moved with arrow keys, PgUp/PgDn, and Home/End. Emits onChange whenever the
 *  selection index changes via keyboard. Appearance follows the same built-in style
 *  naming scheme as the other focusable controls. */
export class ListBox extends Window {
	private items: string[];
	private selectedIndex: number;
	private scrollTop: number;
	private focused: boolean;
	private disabled: boolean;
	private onChange?: (index: number, item: string) => void;

	private normalStyleId:    StyleId;
	private selectedStyleId:  StyleId;
	private focusedSelStyle:  StyleId;
	private disabledStyleId:  StyleId;

	/** Creates a ListBox at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: ListBoxOptions, registry?: StyleRegistry) {
		const reg  = registry ?? new StyleRegistry();
		const bgId = options?.background
			?? reg.getNamed(BUILTIN_WINDOW_BG)
			?? reg.register({ background: 237 });
		const borderColor = options?.disabled
			? reg.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
			: reg.getNamedForeground(BUILTIN_BORDER, 240);

		super(pos, size, {
			background: bgId,
			border: {
				top: true, right: true, bottom: true, left: true,
				style: 'single',
				color: borderColor,
			},
			active: !(options?.disabled ?? false),
		}, reg);

		this.items         = options?.items ?? [];
		this.focused       = options?.focused  ?? false;
		this.disabled      = options?.disabled ?? false;
		this.onChange      = options?.onChange;
		this.scrollTop     = 0;
		this.selectedIndex = options?.selectedIndex ?? (this.items.length > 0 ? 0 : -1);

		this.normalStyleId   = reg.getNamed(BUILTIN_TEXT)          ?? reg.register({ foreground: 252 });
		this.disabledStyleId = reg.getNamed(BUILTIN_TEXT_DISABLED) ?? reg.register({ foreground: 245, dim: true });
		// Selected row: muted highlight when unfocused, bright inverse when focused.
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

	/** Sets the focused state; affects border colour and selection row style on next render(). */
	public setFocused(focused: boolean): void {
		this.focused = focused;
	}

	/** Returns whether the ListBox currently has focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state; dims the control on next render(). */
	public setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether the ListBox is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
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

	/** Rebuilds the list: updates border colour, renders visible rows with styles. */
	public override render(): void {
		this.clear();

		const borderColor = this.disabled
			? this.registry.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
			: this.focused
				? this.registry.getNamedForeground(BUILTIN_BORDER_FOCUSED, 75)
				: this.registry.getNamedForeground(BUILTIN_BORDER, 240);
		this.updateBorder({
			top: true, right: true, bottom: true, left: true,
			style: 'single',
			color: borderColor,
		});

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
