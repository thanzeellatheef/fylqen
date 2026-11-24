import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('Fylqen routes', () => {
  it('renders the home experience', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Make every PDF work for you.' })).toBeInTheDocument()
    expect(screen.getByText('Free to use for now')).toBeInTheDocument()
  })

  it('opens the mobile navigation with an All tools link', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link', { name: 'All tools' })).toHaveLength(2)
  })

  it('renders the editor empty state', () => {
    render(<MemoryRouter initialEntries={['/editor']}><App /></MemoryRouter>)
    expect(screen.getByText('No document selected')).toBeInTheDocument()
  })

  it('exposes text formatting and grouped shape controls in the editor', () => {
    render(<MemoryRouter initialEntries={['/editor']}><App /></MemoryRouter>)
    expect(screen.getByText('Shapes').closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }))
    expect(screen.getByLabelText('Text color')).toBeInTheDocument()
    expect(screen.getByLabelText('Text size')).toBeInTheDocument()
    expect(screen.getByLabelText('PDF font')).toBeInTheDocument()
    expect(within(screen.getByLabelText('PDF font')).getAllByRole('option')).toHaveLength(14)

    expect(screen.getByText('Shapes').closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Shapes'))
    expect(screen.getByLabelText('Shape color')).toBeInTheDocument()
    expect(screen.getByLabelText('Shape stroke thickness')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hexagon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arrow' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }))
    expect(screen.getByLabelText('Highlight color')).toBeInTheDocument()
  })

  it('renders merge tool interface', () => {
    render(<MemoryRouter initialEntries={['/tools/merge']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Merge PDF' })).toBeInTheDocument()
  })

  it('requires two PDFs and appends files chosen in separate batches', () => {
    const { container } = render(<MemoryRouter initialEntries={['/tools/merge']}><App /></MemoryRouter>)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    const processButton = screen.getByRole('button', { name: 'Process & download' })
    const first = new File(['first'], 'first.pdf', { type: 'application/pdf' })
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf' })

    fireEvent.change(input!, { target: { files: [first] } })
    expect(screen.getByText('1 file selected')).toBeInTheDocument()
    expect(processButton).toBeDisabled()

    fireEvent.change(input!, { target: { files: [second] } })
    expect(screen.getByText('2 files selected')).toBeInTheDocument()
    expect(processButton).toBeEnabled()
  })

  it('accepts both PDF and image files for electronic signing', () => {
    const { container } = render(<MemoryRouter initialEntries={['/tools/sign']}><App /></MemoryRouter>)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input?.accept).toContain('image/png')
    fireEvent.change(input!, {
      target: {
        files: [
          new File(['pdf'], 'document.pdf', { type: 'application/pdf' }),
          new File(['image'], 'signature.png', { type: 'image/png' }),
        ],
      },
    })
    expect(screen.getByText('2 files selected')).toBeInTheDocument()
  })

  it('appends a signature image selected after the PDF', () => {
    const { container } = render(<MemoryRouter initialEntries={['/tools/sign']}><App /></MemoryRouter>)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const processButton = screen.getByRole('button', { name: 'Process & download' })

    fireEvent.change(input, { target: { files: [new File(['pdf'], 'document.pdf', { type: 'application/pdf' })] } })
    expect(processButton).toBeDisabled()
    fireEvent.change(input, { target: { files: [new File(['image'], 'signature.png', { type: 'image/png' })] } })
    expect(screen.getByText('2 files selected')).toBeInTheDocument()
    expect(processButton).toBeEnabled()
    expect(screen.getByLabelText('Signature page number')).toHaveValue(1)
  })

  it('offers watermark pattern and lossy compression controls', () => {
    const watermarkView = render(<MemoryRouter initialEntries={['/tools/watermark']}><App /></MemoryRouter>)
    expect(within(screen.getByLabelText('Watermark pattern')).getAllByRole('option')).toHaveLength(3)
    watermarkView.unmount()

    render(<MemoryRouter initialEntries={['/tools/compress']}><App /></MemoryRouter>)
    expect(screen.getByLabelText('Compression mode')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Compression mode'), { target: { value: 'lossy' } })
    expect(screen.getByText(/Text will no longer be selectable\/searchable/)).toBeInTheDocument()
    expect(screen.getByLabelText('Compression quality')).toBeInTheDocument()
  })

  it('renders password protection interface', () => {
    render(<MemoryRouter initialEntries={['/tools/protect']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Protect PDF' })).toBeInTheDocument()
    expect(screen.getByText('Open password')).toBeInTheDocument()
  })

  it('renders OCR interface', () => {
    render(<MemoryRouter initialEntries={['/tools/ocr']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'OCR PDF' })).toBeInTheDocument()
  })

  it('renders certified signing interface', () => {
    render(<MemoryRouter initialEntries={['/tools/sign-certified']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Certified Sign PDF' })).toBeInTheDocument()
    expect(screen.getByText('P12/PFX password')).toBeInTheDocument()
  })
})
