const picker = window.splotysCapturePicker
const grid = document.querySelector('#source-grid')
const audioInput = document.querySelector('#with-audio')
const audioOption = document.querySelector('.audio-option')
const audioDescription = document.querySelector('#audio-description')
const cancelButton = document.querySelector('#cancel')
const filterButtons = [...document.querySelectorAll('[data-filter]')]

let sources = []
let filter = 'all'

const render = () => {
  const visibleSources = sources.filter((source) => filter === 'all' || source.kind === filter)
  grid.replaceChildren()

  if (!visibleSources.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Nenhuma fonte encontrada nesta categoria.'
    grid.append(empty)
    return
  }

  for (const source of visibleSources) {
    const card = document.createElement('button')
    card.className = 'source-card'
    card.type = 'button'
    card.title = `Compartilhar ${source.name}`

    const preview = document.createElement('span')
    preview.className = 'source-card__preview'
    if (source.thumbnail) {
      const image = document.createElement('img')
      image.alt = ''
      image.src = source.thumbnail
      preview.append(image)
    }

    const kind = document.createElement('small')
    kind.className = 'source-card__kind'
    kind.textContent = source.kind === 'screen' ? 'TELA' : 'JANELA'
    preview.append(kind)

    const name = document.createElement('span')
    name.className = 'source-card__name'
    if (source.appIcon) {
      const appIcon = document.createElement('img')
      appIcon.alt = ''
      appIcon.src = source.appIcon
      name.append(appIcon)
    }
    const label = document.createElement('span')
    label.textContent = source.name
    name.append(label)

    card.append(preview, name)
    card.addEventListener('click', () => picker.select(source.id, audioInput.checked))
    grid.append(card)
  }
}

if (picker.platform !== 'win32') {
  audioInput.checked = false
  audioInput.disabled = true
  audioOption.classList.add('is-disabled')
  audioDescription.textContent = 'A captura de áudio do sistema nesta versão está disponível no Windows.'
}

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter
    for (const candidate of filterButtons) candidate.classList.toggle('is-active', candidate === button)
    render()
  })
}

cancelButton.addEventListener('click', () => picker.cancel())
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') picker.cancel()
})

picker.listSources().then((nextSources) => {
  sources = nextSources
  render()
}).catch(() => {
  sources = []
  render()
})
