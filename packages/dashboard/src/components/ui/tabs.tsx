import * as React from "react"
import { cn } from "@/lib/utils"

// -----------------------------------------------------------------------------
// context & helpers
// -----------------------------------------------------------------------------

interface TabsContextValue {
  value: string
  onChange: (val: string) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

// -----------------------------------------------------------------------------
// Tabs (root)
// -----------------------------------------------------------------------------

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** initial value for uncontrolled mode */
  defaultValue?: string
  /** controlled value */
  value?: string
  /** callback when the selected tab changes */
  onValueChange?: (value: string) => void
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      defaultValue,
      value: controlledValue,
      onValueChange,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const [uncontrolledValue, setUncontrolledValue] =
      React.useState<string | undefined>(defaultValue)

    const isControlled = controlledValue !== undefined
    const selectedValue = isControlled ? controlledValue : uncontrolledValue

    const handleChange = React.useCallback(
      (newVal: string) => {
        if (!isControlled) {
          setUncontrolledValue(newVal)
        }
        onValueChange?.(newVal)
      },
      [isControlled, onValueChange]
    )

    return (
      <TabsContext.Provider
        value={{ value: selectedValue ?? "", onChange: handleChange }}
      >
        <div
          ref={ref}
          className={cn("flex flex-col", className)}
          {...props}
        >
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = "Tabs"

// -----------------------------------------------------------------------------
// TabsList
// -----------------------------------------------------------------------------

export type TabsListProps = React.HTMLAttributes<HTMLDivElement>;

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const key = e.key

      const tabs = Array.from(
        e.currentTarget.querySelectorAll('[role="tab"]')
      ) as HTMLElement[]

      if (tabs.length === 0) return

      const currentIndex = tabs.findIndex((t) => t === document.activeElement)
      let nextIndex = currentIndex

      switch (key) {
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % tabs.length
          break
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
          break
        case "Home":
          nextIndex = 0
          break
        case "End":
          nextIndex = tabs.length - 1
          break
        default:
          return
      }

      tabs[nextIndex]?.focus()
      e.preventDefault()
    }

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation="horizontal"
        className={cn("flex", className)}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TabsList.displayName = "TabsList"

// -----------------------------------------------------------------------------
// TabsTrigger
// -----------------------------------------------------------------------------

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** value that identifies this tab */
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className, children, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    if (!context) {
      throw new Error("TabsTrigger must be used within a Tabs component")
    }
    const selected = context.value === value

    return (
      <button
        ref={ref}
        role="tab"
        id={`tab-${value}`}
        type="button"
        aria-selected={selected}
        aria-controls={`tabpanel-${value}`}
        tabIndex={selected ? 0 : -1}
        className={cn(
          "px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none",
          selected
            ? "border-b-2 border-link text-link"
            : "text-muted-foreground hover:text-foreground cursor-pointer focus-visible:border-b-2 focus-visible:border-ring",
          className
        )}
        onClick={() => context.onChange(value)}
        {...props}
      >
        {children}
      </button>
    )
  }
)
TabsTrigger.displayName = "TabsTrigger"

// -----------------------------------------------------------------------------
// TabsContent
// -----------------------------------------------------------------------------

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** value that corresponds to the associated trigger */
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className, children, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    if (!context) {
      throw new Error("TabsContent must be used within a Tabs component")
    }
    const hidden = context.value !== value

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`tabpanel-${value}`}
        aria-labelledby={`tab-${value}`}
        hidden={hidden}
        className={cn(hidden ? "hidden" : "block", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TabsContent.displayName = "TabsContent"

// -----------------------------------------------------------------------------
// exports
// -----------------------------------------------------------------------------

export { Tabs, TabsList, TabsTrigger, TabsContent }
