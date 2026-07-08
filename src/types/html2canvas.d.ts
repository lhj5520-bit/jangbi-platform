declare module 'html2canvas' {
  interface Options {
    scale?: number
    useCORS?: boolean
    backgroundColor?: string | null
    logging?: boolean
    width?: number
    height?: number
  }
  function html2canvas(element: HTMLElement, options?: Options): Promise<HTMLCanvasElement>
  export = html2canvas
}
