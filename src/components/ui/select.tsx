import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import { useTranslations } from "use-intl"

import {
  PickerPanel,
  PickerRoot,
  PickerTrigger,
} from "@/components/pickers/picker-shell"
import { Input } from "@/components/ui/input"
import { normaliseName } from "@/lib/text/normalise"
import { cn } from "@/lib/utils"

/*
 * The program's own dropdown (the developer, 2026-10-22). It keeps the shadcn
 * Select's exports and the props this program's screens pass, so no screen
 * changed, but it is no longer Radix's Select:
 *
 *  - the list opens in the pickers' panel (src/components/pickers/picker-shell.tsx):
 *    clicking an item only marks it; «تأكيد» (or Enter) applies it, «إلغاء»,
 *    Escape and a click outside leave the value as it was;
 *  - above ten items the panel has a search box (normaliseName, so «أ» finds «ا»);
 *  - no hidden native <select> is drawn, inside a form or anywhere else.
 *
 * The field is the same surface as before (fieldShell, the same heights, a
 * chevron at the end, `data-placeholder` while empty).
 */

interface ItemInfo {
  value: string
  node: React.ReactNode
  text: string
  disabled: boolean
}

interface SelectContextValue {
  value: string | undefined
  draft: string | undefined
  setDraft: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  confirm: () => void
  disabled: boolean
  items: ItemInfo[]
  query: string
  setQuery: (query: string) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext(part: string): SelectContextValue {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error(`ui: <${part}> must be inside <Select>`)
  return context
}

/** The text an item shows, read from its children (a string, <Ltr>, <bdi>…), for the search box. */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(" ")
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children)
  }
  return ""
}

/** Every <SelectItem> under the <SelectContent> among a Select's children, in order. */
function collectItems(node: React.ReactNode, into: ItemInfo[], inContent: boolean) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as {
      value?: string
      children?: React.ReactNode
      disabled?: boolean
    }
    if (child.type === SelectItem) {
      into.push({
        value: String(props.value ?? ""),
        node: props.children,
        text: textOf(props.children),
        disabled: props.disabled === true,
      })
      return
    }
    const walk =
      child.type === SelectContent ||
      child.type === React.Fragment ||
      (inContent && child.type === SelectGroup)
    if (walk) collectItems(props.children, into, inContent || child.type === SelectContent)
  })
}

const SEARCH_FROM = 10

function Select({
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  const [inner, setInner] = React.useState(defaultValue)
  const current = value !== undefined ? value : inner
  const [open, setOpenState] = React.useState(false)
  const [draft, setDraft] = React.useState<string | undefined>(current)
  const [query, setQuery] = React.useState("")

  const items = React.useMemo(() => {
    const found: ItemInfo[] = []
    collectItems(children, found, false)
    return found
  }, [children])

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (next) {
        setDraft(current)
        setQuery("")
      }
      setOpenState(next)
    },
    [current]
  )

  const confirm = React.useCallback(() => {
    if (draft !== undefined && draft !== current) {
      if (value === undefined) setInner(draft)
      onValueChange?.(draft)
    }
    setOpenState(false)
  }, [draft, current, value, onValueChange])

  const context = React.useMemo<SelectContextValue>(
    () => ({
      value: current,
      draft,
      setDraft,
      open,
      setOpen,
      confirm,
      disabled,
      items,
      query,
      setQuery,
    }),
    [current, draft, open, setOpen, confirm, disabled, items, query]
  )

  return (
    <SelectContext.Provider value={context}>
      <PickerRoot open={open} onOpenChange={setOpen}>
        {children}
      </PickerRoot>
    </SelectContext.Provider>
  )
}

function SelectGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  placeholder,
  className,
}: {
  placeholder?: React.ReactNode
  className?: string
}) {
  const { value, items } = useSelectContext("SelectValue")
  const chosen =
    value === undefined || value === ""
      ? undefined
      : items.find((item) => item.value === value)
  return (
    <span
      data-slot="select-value"
      className={cn("line-clamp-1 flex items-center gap-2", className)}
    >
      {value === undefined || value === "" ? placeholder : chosen?.node}
    </span>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  onKeyDown,
  disabled: triggerDisabled,
  ...props
}: Omit<React.ComponentProps<"button">, "type"> & {
  size?: "sm" | "default"
}) {
  const { value, disabled, open, setOpen } = useSelectContext("SelectTrigger")
  return (
    <PickerTrigger
      data-slot="select-trigger"
      size={size}
      empty={value === undefined || value === ""}
      disabled={disabled || triggerDisabled}
      // `w-fit` as the shadcn trigger had: a screen that wants it wide says `w-full`.
      className={cn("w-fit", className)}
      icon={<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || open) return
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault()
          setOpen(true)
        }
      }}
      {...props}
    >
      {children}
    </PickerTrigger>
  )
}

function SelectContent({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
  /** Accepted and ignored: the list always opens below its field. */
  position?: "item-aligned" | "popper"
  align?: "start" | "center" | "end"
}) {
  const t = useTranslations("Pickers")
  const { draft, setDraft, setOpen, confirm, items, query, setQuery } =
    useSelectContext("SelectContent")
  const listRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const searchable = items.length > SEARCH_FROM
  const needle = normaliseName(query)
  const anyShown = items.some(
    (item) => !needle || normaliseName(item.text).includes(needle)
  )

  // The marked item is in view when the list opens and as the arrows move it.
  React.useEffect(() => {
    const list = listRef.current
    if (!list || draft === undefined) return
    const marked = Array.from(
      list.querySelectorAll<HTMLElement>("[role=option]")
    ).find((option) => option.dataset.value === draft)
    marked?.scrollIntoView({ block: "nearest" })
  }, [draft])

  function move(event: React.KeyboardEvent) {
    // Only keys pressed in the list or the search box: a footer button keeps its own Enter.
    const target = event.target as Node
    const inSearch = target === searchRef.current
    if (!inSearch && !listRef.current?.contains(target)) return
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(
        "[role=option]:not([aria-disabled=true])"
      ) ?? []
    )
    if (options.length === 0) return
    const at = options.findIndex((option) => option.dataset.value === draft)
    let next: number | null = null
    if (event.key === "ArrowDown") next = at < 0 ? 0 : Math.min(at + 1, options.length - 1)
    else if (event.key === "ArrowUp") next = at < 0 ? options.length - 1 : Math.max(at - 1, 0)
    else if (event.key === "Home" && !inSearch) next = 0
    else if (event.key === "End" && !inSearch) next = options.length - 1
    else if (event.key === "Enter" && !inSearch) {
      event.preventDefault()
      event.stopPropagation()
      confirm()
      return
    }
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    const value = options[next].dataset.value
    if (value !== undefined) setDraft(value)
  }

  return (
    <PickerPanel
      label={t("Choose")}
      initialFocus={searchable ? searchRef : listRef}
      onConfirm={confirm}
      onCancel={() => setOpen(false)}
      confirmDisabled={draft === undefined}
      className={className}
      bodyClassName="max-h-[min(24rem,var(--radix-popover-content-available-height))] p-1.5"
      onKeyDown={move}
    >
      {searchable && (
        <div className="sticky top-0 z-10 bg-popover p-1.5 pb-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              autoComplete="off"
              aria-label={t("Search")}
              placeholder={t("Search")}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 ps-9 short:h-11 tall:h-11"
            />
          </div>
        </div>
      )}
      <div
        ref={listRef}
        role="listbox"
        tabIndex={-1}
        data-slot="select-content"
        className="outline-hidden"
      >
        {children}
        {!anyShown && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t("NoMatch")}
          </p>
        )}
      </div>
    </PickerPanel>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  value,
  disabled = false,
}: {
  className?: string
  children?: React.ReactNode
  value: string
  disabled?: boolean
}) {
  const { draft, setDraft, query } = useSelectContext("SelectItem")
  const needle = normaliseName(query)
  if (needle && !normaliseName(textOf(children)).includes(needle)) return null
  const marked = draft === value
  return (
    <div
      role="option"
      aria-selected={marked}
      aria-disabled={disabled || undefined}
      data-slot="select-item"
      data-value={value}
      data-marked={marked || undefined}
      // Logical `ps`/`pe` and `end-3`: the tick lands on the trailing edge in Arabic too.
      className={cn(
        "relative flex min-h-[44px] w-full cursor-default items-center gap-2 rounded-md py-2 ps-3 pe-9 text-base outline-hidden select-none hover:bg-accent hover:text-accent-foreground data-marked:bg-accent data-marked:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.1em]",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => {
        if (!disabled) setDraft(value)
      }}
    >
      <span className="pointer-events-none absolute end-3 flex size-4 items-center justify-center">
        {marked && <CheckIcon className="pointer-events-none" />}
      </span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
