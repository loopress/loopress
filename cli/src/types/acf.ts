export interface AcfField {
  key: string
  label: string
  name: string
  type: string
  [key: string]: unknown
}

export interface AcfFieldGroup {
  key: string
  title: string
  fields: AcfField[]
  location: unknown[][]
  menu_order?: number
  position?: string
  style?: string
  label_placement?: string
  instruction_placement?: string
  hide_on_screen?: string | string[]
  [key: string]: unknown
}
