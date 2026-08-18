import { useEffect } from 'react'
import type { ContextMenuPoint, GalleryLayoutMode } from '../../types'
import { Icon } from '../ui/Icon'

const options: Array<{
  id: GalleryLayoutMode
  label: string
  detail: string
}> = [
  {
    id: 'expanded',
    label: 'Preencher',
    detail: 'Mais altura, cards até 4:3.',
  },
  {
    id: 'cinema',
    label: 'Priorizar 16:9',
    detail: 'Mantém o enquadramento widescreen.',
  },
]

export const GalleryLayoutMenu = ({
  layout,
  point,
  onChange,
  onClose,
}: {
  layout: GalleryLayoutMode
  point: ContextMenuPoint
  onChange: (layout: GalleryLayoutMode) => void
  onClose: () => void
}) => {
  const menuWidth = 310
  const menuHeight = 196
  const left = Math.max(8, Math.min(point.x, window.innerWidth - menuWidth - 8))
  const top = Math.max(8, Math.min(point.y, window.innerHeight - menuHeight - 8))

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <>
      <button
        aria-label="Fechar opções de layout"
        className="context-menu-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-label="Layout da galeria"
        className="context-menu gallery-layout-menu"
        onContextMenu={(event) => event.preventDefault()}
        role="dialog"
        style={{ left, top }}
      >
        <header>
          <span className="context-menu__avatar"><Icon name="layout" /></span>
          <span><strong>Layout da galeria</strong><small>Preferência só deste navegador</small></span>
        </header>
        <div aria-label="Escolher layout" className="gallery-layout-menu__options" role="radiogroup">
          {options.map((option) => (
            <button
              aria-checked={layout === option.id}
              className={layout === option.id ? 'is-active' : ''}
              key={option.id}
              onClick={() => {
                onChange(option.id)
                onClose()
              }}
              role="radio"
              type="button"
            >
              <span className={`gallery-layout-preview gallery-layout-preview--${option.id}`} aria-hidden="true"><i /><i /><i /></span>
              <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              <i className="gallery-layout-menu__check" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
