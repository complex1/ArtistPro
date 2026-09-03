import type { ComponentProps, ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

export function IconButton({
  icon: Icon,
  label,
  active,
  ...props
}: ComponentProps<'button'> & {
  icon: LucideIcon
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' is-active' : ''}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={16} strokeWidth={1.7} />
    </button>
  )
}

export function Button({
  variant = 'ghost',
  ...props
}: ComponentProps<'button'> & { variant?: 'ghost' | 'primary' | 'outline' }) {
  return <button type="button" className={`button ${variant}`} {...props} />
}

export function Select({
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <span className="select-wrap">
      <select className="select" {...props}>
        {children}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </span>
  )
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children?: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <ChevronDown size={12} />
        <span>{title}</span>
      </summary>
      {children && <div className="section-body">{children}</div>}
    </details>
  )
}
