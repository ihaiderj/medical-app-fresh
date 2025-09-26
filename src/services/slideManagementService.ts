// Slide Management Service
// Handles all CRUD operations for slides and brochures

export interface Slide {
  id: string
  title: string
  image: string
  group: string
  order: number
  createdAt: Date
  updatedAt: Date
}

export interface Brochure {
  id: number
  title: string
  category: string
  slides: Slide[]
  createdAt: Date
  updatedAt: Date
}

export interface SlideGroup {
  name: string
  slides: Slide[]
  order: number
}

export interface CreateSlideData {
  title: string
  image: string
  group: string
  order?: number
}

export interface UpdateSlideData {
  title?: string
  image?: string
  group?: string
  order?: number
}

export interface ReorderSlidesData {
  slideId: string
  newOrder: number
}

export class SlideManagementService {
  private static brochures: Brochure[] = [
    {
      id: 1,
      title: "CardioMax Pro Series",
      category: "Cardiology",
      slides: [
        {
          id: "1-1",
          title: "Introduction to CardioMax",
          image: "/medical-slide-cardio-intro.png",
          group: "Overview",
          order: 1,
          createdAt: new Date("2024-01-15"),
          updatedAt: new Date("2024-01-15"),
        },
        {
          id: "1-2",
          title: "Treatment Options",
          image: "/medical-slide-treatment-options.png",
          group: "Overview",
          order: 2,
          createdAt: new Date("2024-01-15"),
          updatedAt: new Date("2024-01-15"),
        },
        {
          id: "1-3",
          title: "Clinical Studies",
          image: "/medical-slide-clinical-studies.png",
          group: "Evidence",
          order: 3,
          createdAt: new Date("2024-01-15"),
          updatedAt: new Date("2024-01-15"),
        },
        {
          id: "1-4",
          title: "Patient Benefits",
          image: "/medical-slide-patient-benefits.png",
          group: "Evidence",
          order: 4,
          createdAt: new Date("2024-01-15"),
          updatedAt: new Date("2024-01-15"),
        },
        {
          id: "1-5",
          title: "Dosage Guidelines",
          image: "/medical-slide-dosage-guidelines.png",
          group: "Implementation",
          order: 5,
          createdAt: new Date("2024-01-15"),
          updatedAt: new Date("2024-01-15"),
        },
      ],
      createdAt: new Date("2024-01-15"),
      updatedAt: new Date("2024-01-15"),
    },
    {
      id: 4,
      title: "Visualet Fervid 23-080-2025",
      category: "Cardiology",
      slides: [
        {
          id: "4-1",
          title: "Visualet Fervid - Overview",
          image: "/medical-slide-cardio-intro.png",
          group: "Overview",
          order: 1,
          createdAt: new Date("2024-01-20"),
          updatedAt: new Date("2024-01-20"),
        },
        {
          id: "4-2",
          title: "Clinical Benefits",
          image: "/medical-slide-patient-benefits.png",
          group: "Benefits",
          order: 2,
          createdAt: new Date("2024-01-20"),
          updatedAt: new Date("2024-01-20"),
        },
        {
          id: "4-3",
          title: "Dosage Guidelines",
          image: "/medical-slide-dosage-guidelines.png",
          group: "Implementation",
          order: 3,
          createdAt: new Date("2024-01-20"),
          updatedAt: new Date("2024-01-20"),
        },
        {
          id: "4-4",
          title: "Clinical Studies",
          image: "/medical-slide-clinical-studies.png",
          group: "Evidence",
          order: 4,
          createdAt: new Date("2024-01-20"),
          updatedAt: new Date("2024-01-20"),
        },
        {
          id: "4-5",
          title: "Side Effects",
          image: "/medical-slide-side-effects.png",
          group: "Safety",
          order: 5,
          createdAt: new Date("2024-01-20"),
          updatedAt: new Date("2024-01-20"),
        },
      ],
      createdAt: new Date("2024-01-20"),
      updatedAt: new Date("2024-01-20"),
    },
  ]

  /**
   * Get all brochures
   */
  static async getBrochures(): Promise<Brochure[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([...this.brochures])
      }, 100)
    })
  }

  /**
   * Get brochure by ID
   */
  static async getBrochureById(id: number): Promise<Brochure | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === id)
        resolve(brochure ? { ...brochure } : null)
      }, 100)
    })
  }

  /**
   * Get slides for a brochure
   */
  static async getSlides(brochureId: number): Promise<Slide[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        resolve(brochure ? [...brochure.slides] : [])
      }, 100)
    })
  }

  /**
   * Get slides grouped by category
   */
  static async getGroupedSlides(brochureId: number): Promise<SlideGroup[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          resolve([])
          return
        }

        const grouped = brochure.slides.reduce((acc, slide) => {
          let group = acc.find(g => g.name === slide.group)
          if (!group) {
            group = { name: slide.group, slides: [], order: acc.length }
            acc.push(group)
          }
          group.slides.push(slide)
          return acc
        }, [] as SlideGroup[])

        // Sort slides within each group by order
        grouped.forEach(group => {
          group.slides.sort((a, b) => a.order - b.order)
        })

        resolve(grouped)
      }, 100)
    })
  }

  /**
   * Create a new slide
   */
  static async createSlide(brochureId: number, slideData: CreateSlideData): Promise<Slide> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        const newSlide: Slide = {
          id: `${brochureId}-${Date.now()}`,
          title: slideData.title,
          image: slideData.image,
          group: slideData.group,
          order: slideData.order || brochure.slides.length + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        brochure.slides.push(newSlide)
        brochure.updatedAt = new Date()

        resolve({ ...newSlide })
      }, 200)
    })
  }

  /**
   * Update an existing slide
   */
  static async updateSlide(brochureId: number, slideId: string, slideData: UpdateSlideData): Promise<Slide> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        const slideIndex = brochure.slides.findIndex(s => s.id === slideId)
        if (slideIndex === -1) {
          reject(new Error("Slide not found"))
          return
        }

        const updatedSlide = {
          ...brochure.slides[slideIndex],
          ...slideData,
          updatedAt: new Date(),
        }

        brochure.slides[slideIndex] = updatedSlide
        brochure.updatedAt = new Date()

        resolve({ ...updatedSlide })
      }, 200)
    })
  }

  /**
   * Delete a slide
   */
  static async deleteSlide(brochureId: number, slideId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        const slideIndex = brochure.slides.findIndex(s => s.id === slideId)
        if (slideIndex === -1) {
          reject(new Error("Slide not found"))
          return
        }

        brochure.slides.splice(slideIndex, 1)
        brochure.updatedAt = new Date()

        // Reorder remaining slides
        brochure.slides.forEach((slide, index) => {
          slide.order = index + 1
        })

        resolve(true)
      }, 200)
    })
  }

  /**
   * Reorder slides
   */
  static async reorderSlides(brochureId: number, reorderData: ReorderSlidesData[]): Promise<Slide[]> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        // Update slide orders
        reorderData.forEach(({ slideId, newOrder }) => {
          const slide = brochure.slides.find(s => s.id === slideId)
          if (slide) {
            slide.order = newOrder
            slide.updatedAt = new Date()
          }
        })

        // Sort slides by new order
        brochure.slides.sort((a, b) => a.order - b.order)
        brochure.updatedAt = new Date()

        resolve([...brochure.slides])
      }, 200)
    })
  }

  /**
   * Move slide to different group
   */
  static async moveSlideToGroup(brochureId: number, slideId: string, newGroup: string): Promise<Slide> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        const slide = brochure.slides.find(s => s.id === slideId)
        if (!slide) {
          reject(new Error("Slide not found"))
          return
        }

        slide.group = newGroup
        slide.updatedAt = new Date()
        brochure.updatedAt = new Date()

        resolve({ ...slide })
      }, 200)
    })
  }

  /**
   * Duplicate a slide
   */
  static async duplicateSlide(brochureId: number, slideId: string): Promise<Slide> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        const originalSlide = brochure.slides.find(s => s.id === slideId)
        if (!originalSlide) {
          reject(new Error("Slide not found"))
          return
        }

        const duplicatedSlide: Slide = {
          id: `${brochureId}-${Date.now()}`,
          title: `${originalSlide.title} (Copy)`,
          image: originalSlide.image,
          group: originalSlide.group,
          order: brochure.slides.length + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        brochure.slides.push(duplicatedSlide)
        brochure.updatedAt = new Date()

        resolve({ ...duplicatedSlide })
      }, 200)
    })
  }

  /**
   * Get available groups for a brochure
   */
  static async getGroups(brochureId: number): Promise<string[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          resolve([])
          return
        }

        const groups = Array.from(new Set(brochure.slides.map(slide => slide.group)))
        resolve(groups.sort())
      }, 100)
    })
  }

  /**
   * Create a new group
   */
  static async createGroup(brochureId: number, groupName: string): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Groups are automatically created when slides are assigned to them
        // This is just a placeholder for future functionality
        resolve(true)
      }, 100)
    })
  }

  /**
   * Delete a group (moves slides to "General" group)
   */
  static async deleteGroup(brochureId: number, groupName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        // Move all slides in the group to "General"
        brochure.slides.forEach(slide => {
          if (slide.group === groupName) {
            slide.group = "General"
            slide.updatedAt = new Date()
          }
        })

        brochure.updatedAt = new Date()
        resolve(true)
      }, 200)
    })
  }

  /**
   * Rename a group
   */
  static async renameGroup(brochureId: number, oldGroupName: string, newGroupName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        // Update all slides in the group
        brochure.slides.forEach(slide => {
          if (slide.group === oldGroupName) {
            slide.group = newGroupName
            slide.updatedAt = new Date()
          }
        })

        brochure.updatedAt = new Date()
        resolve(true)
      }, 200)
    })
  }

  /**
   * Import slides from PDF conversion
   */
  static async importSlidesFromPDF(brochureId: number, pdfPages: any[]): Promise<Slide[]> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const brochure = this.brochures.find(b => b.id === brochureId)
        if (!brochure) {
          reject(new Error("Brochure not found"))
          return
        }

        const importedSlides: Slide[] = pdfPages.map((page, index) => ({
          id: `${brochureId}-${Date.now()}-${index}`,
          title: page.title || `Page ${index + 1}`,
          image: page.imagePath,
          group: page.group || "General",
          order: brochure.slides.length + index + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))

        brochure.slides.push(...importedSlides)
        brochure.updatedAt = new Date()

        resolve([...importedSlides])
      }, 500)
    })
  }
}

// Export service functions
export const slideManagementService = SlideManagementService









