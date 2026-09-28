import React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

// Design system: track, range and thumb on theme roles inside an opted-in
// scope; the legacy lime slider outside one, byte for byte.
const THEMED = {
  track: "relative h-2 w-full grow overflow-hidden rounded-full bg-pl-border",
  range: "absolute h-full bg-pl-primary",
  thumb: "block h-5 w-5 rounded-full border-2 border-pl-primary bg-pl-surface shadow-pl-sm ring-offset-pl-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
}

const Slider = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className={THEMED.track}>
        <SliderPrimitive.Range className={THEMED.range} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className={THEMED.thumb} />
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
