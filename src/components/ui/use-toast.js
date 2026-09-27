import { useState, useEffect } from "react"
import { toast as sonner } from "sonner"

// Senior test T1 (2026-09-27): the Horizons re-import (f6ec2b9db,
// 2026-04-21) replaced the Toaster that rendered this store with sonner's,
// and nothing calls sonner, so every toast from the 215 files that use this
// hook (saves, errors, validation) rendered nowhere. Each toast is now also
// shown through sonner, the toaster App.jsx mounts. The store is kept so
// useToast() callers and tests read what they always read.
const showInSonner = (id, { title, description, variant, duration }) => {
  const show = variant === "destructive" ? sonner.error : sonner
  show(title ?? "", { id: `ut-${id}`, description, duration })
}

const TOAST_LIMIT = 1

let count = 0
function generateId() {
  count = (count + 1) % Number.MAX_VALUE
  return count.toString()
}

const toastStore = {
  state: {
    toasts: [],
  },
  listeners: [],
  
  getState: () => toastStore.state,
  
  setState: (nextState) => {
    if (typeof nextState === 'function') {
      toastStore.state = nextState(toastStore.state)
    } else {
      toastStore.state = { ...toastStore.state, ...nextState }
    }
    
    toastStore.listeners.forEach(listener => listener(toastStore.state))
  },
  
  subscribe: (listener) => {
    toastStore.listeners.push(listener)
    return () => {
      toastStore.listeners = toastStore.listeners.filter(l => l !== listener)
    }
  }
}

export const toast = ({ ...props }) => {
  const id = generateId()

  const update = (props) => {
    const current = toastStore.getState().toasts.find((t) => t.id === id)
    showInSonner(id, { ...current, ...props })
    return toastStore.setState((state) => ({
      ...state,
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, ...props } : t
      ),
    }))
  }

  const dismiss = () => {
    sonner.dismiss(`ut-${id}`)
    toastStore.setState((state) => ({
      ...state,
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  }

  showInSonner(id, props)

  toastStore.setState((state) => ({
    ...state,
    toasts: [
      { ...props, id, dismiss },
      ...state.toasts,
    ].slice(0, TOAST_LIMIT),
  }))

  return {
    id,
    dismiss,
    update,
  }
}

export function useToast() {
  const [state, setState] = useState(toastStore.getState())
  
  useEffect(() => {
    const unsubscribe = toastStore.subscribe((state) => {
      setState(state)
    })
    
    return unsubscribe
  }, [])
  
  useEffect(() => {
    const timeouts = []

    state.toasts.forEach((toast) => {
      if (toast.duration === Infinity) {
        return
      }

      const timeout = setTimeout(() => {
        toast.dismiss()
      }, toast.duration || 5000)

      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout))
    }
  }, [state.toasts])

  return {
    toast,
    toasts: state.toasts,
  }
}