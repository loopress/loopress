export interface MenuLocation {
  menu: number
  name: string
}

export interface NavMenu {
  id: number
  name: string
  slug: string
  description?: string
  [key: string]: any
}
