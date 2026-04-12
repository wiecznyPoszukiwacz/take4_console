import type { TabsProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** A tabbed container. Renders a header row with tab titles and shows only the
 *  children associated with the active tab index. Other children added via the
 *  regular addChild() are treated as "pinned" and stay visible regardless of
 *  which tab is active.
 *
 *  Keyboard: ← / → cycle tabs while focused. Tab / Shift-Tab remain reserved
 *  for the WindowManager focus cycle, so they are never intercepted here. */
export class Tabs extends Window {
	private titles: string[];
	private activeIndex: number;
	private onChange?: (index: number, title: string) => void;
	/** Maps each tagged child to its tab index. Untagged children are always visible. */
	private childTab: Map<Window, number>;
	private activeTextStyleId: StyleId;
	private separatorStyleId: StyleId;

	/** Creates a Tabs control from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: TabsProperties) {
		super({
			...wp,
			defaultBorder: { top: true, right: true, bottom: true, left: true, style: 'single' },
		});

		this.titles      = cp?.titles ?? [];
		this.activeIndex = Math.max(0, Math.min(this.titles.length - 1, cp?.activeIndex ?? 0));
		this.onChange    = cp?.onChange;
		this.childTab    = new Map();

		// Active tab: inverse highlight; brighter when focused (uses Window.focusedStyleId).
		const reg = getRegistry();
		this.activeTextStyleId = reg.register({ background: 238, foreground: 255, bold: true });
		this.separatorStyleId  = reg.register({ foreground: 240 });
	}

	/** Adds a child window and associates it with the given tab index. Children
	 *  added this way are only rendered while their tab is active. */
	public addChildToTab(tabIndex: number, child: Window): void {
		this.addChild(child);
		this.childTab.set(child, tabIndex);
	}

	/** Replaces the tab titles. Clamps activeIndex into the new range. */
	public setTitles(titles: string[]): void {
		this.titles      = titles;
		this.activeIndex = Math.max(0, Math.min(titles.length - 1, this.activeIndex));
	}

	/** Returns the current tab titles. */
	public getTitles(): string[] {
		return this.titles;
	}

	/** Sets the active tab index. Clamped to the valid range. Fires onChange if it differs. */
	public setActiveIndex(index: number): void {
		if (this.titles.length === 0) {
			this.activeIndex = 0;
			return;
		}
		const clamped = Math.max(0, Math.min(this.titles.length - 1, index));
		if (clamped !== this.activeIndex) {
			this.activeIndex = clamped;
			this.onChange?.(clamped, this.titles[clamped]);
		}
	}

	/** Returns the currently active tab index. */
	public getActiveIndex(): number {
		return this.activeIndex;
	}

	/** Processes a key press; Left/Right arrows cycle through tabs (no wrap-around). */
	public handleKey(key: string): void {
		if (this.disabled || this.titles.length === 0) return;
		if (key === '\x1b[D') { // Left arrow
			this.setActiveIndex(this.activeIndex - 1);
		} else if (key === '\x1b[C') { // Right arrow
			this.setActiveIndex(this.activeIndex + 1);
		}
	}

	/** Rebuilds the tabs: draws header row, composites only the active tab's children.
	 *  Note: content is NOT cleared on each render, so user-written decorations (e.g. sparkline
	 *  labels placed via writeText) survive across frames. The header row is fully overwritten. */
	public override render(): void {

		this.drawHeader();

		// Temporarily restrict children to those visible in the active tab.
		const original = this.children;
		this.children = original.filter(c => {
			const tab = this.childTab.get(c);
			return tab === undefined || tab === this.activeIndex;
		});
		try {
			super.render();
		} finally {
			this.children = original;
		}
	}

	/** Writes the header row (tab titles + separators) into content at y=0. The full
	 *  width of the row is overwritten so that title changes never leave stale glyphs. */
	private drawHeader(): void {
		const { width } = this.getInnerSize();
		if (width < 1) return;

		// Blank the full header row first so stale cells from previous renders disappear.
		this.writeText(' '.repeat(width), { x: 0, y: 0 });

		if (this.titles.length === 0) return;

		let x = 1; // leading space so the first title does not touch the border
		for (let i = 0; i < this.titles.length; i++) {
			if (x >= width) break;

			const title    = this.titles[i];
			const padded   = ` ${title} `;
			const isActive = i === this.activeIndex;
			const style: StyleId = this.disabled
				? this.disabledStyleId
				: isActive
					? (this.focused ? this.focusedStyleId : this.activeTextStyleId)
					: this.normalStyleId;

			const visible = padded.slice(0, width - x);
			this.writeText(visible, { x, y: 0, style });
			x += visible.length;

			if (i < this.titles.length - 1 && x < width) {
				this.writeText('│', { x, y: 0, style: this.separatorStyleId });
				x++;
			}
		}
	}
}
