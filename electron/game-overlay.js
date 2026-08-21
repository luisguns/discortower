const container = document.querySelector('#participants')

const initialsFor = (name) => name
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0] || '')
  .join('')
  .toUpperCase()
  .slice(0, 2) || '?'

const render = (state) => {
  container.replaceChildren()
  const participants = Array.isArray(state?.participants) ? state.participants.slice(0, 8) : []

  participants.forEach((participant) => {
    const row = document.createElement('section')
    row.className = `participant${participant.speaking ? ' is-speaking' : ''}`

    const avatar = document.createElement('span')
    avatar.className = 'avatar'
    avatar.textContent = initialsFor(participant.name || '')

    const name = document.createElement('strong')
    name.className = 'name'
    name.textContent = participant.name || 'Participante'
    if (participant.isLocal) {
      const you = document.createElement('small')
      you.className = 'you'
      you.textContent = 'você'
      name.append(you)
    }

    const microphone = document.createElement('span')
    microphone.className = `mic${participant.muted ? ' is-muted' : ''}`
    microphone.setAttribute('aria-label', participant.muted ? 'Microfone silenciado' : 'Microfone ligado')
    microphone.innerHTML = participant.muted
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15.9 10.4V7a4 4 0 0 0-7.6-1.7M5 11a7 7 0 0 0 11.9 5M19 11a7 7 0 0 1-.7 3.1M12 18v3M8 21h8M3 3l18 18"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="13" x="8" y="3" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>'

    row.append(avatar, name, microphone)
    container.append(row)
  })
}

if (window.fordKallOverlay) {
  window.fordKallOverlay.onState(render)
} else if (new URLSearchParams(window.location.search).has('preview')) {
  render({
    participants: [
      { name: 'Torres', isLocal: true, muted: false, speaking: true },
      { name: 'Pansinha', isLocal: false, muted: false, speaking: false },
      { name: 'Kiwi', isLocal: false, muted: true, speaking: false },
    ],
  })
}
