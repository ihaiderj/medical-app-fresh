import { BrochureData, BrochureSlide, SlideGroup } from './brochureManagementService'
// import { BrochureSyncData } from './brochureSyncService' // DELETED
// Define BrochureSyncData locally
interface BrochureSyncData {
  brochureId: string;
  brochureTitle?: string;
  title?: string;
  slides: any[];
  groups: any[];
  totalSlides?: number;
  lastModified: string;
}

export interface BrochureDifference {
  slides: {
    added: BrochureSlide[]
    removed: BrochureSlide[]
    modified: Array<{ local: BrochureSlide; server: BrochureSlide }>
    addedCount: number
    removedCount: number
    modifiedCount: number
  }
  groups: {
    added: SlideGroup[]
    removed: SlideGroup[]
    modified: Array<{ local: SlideGroup; server: SlideGroup }>
    addedCount: number
    removedCount: number
    modifiedCount: number
  }
  metadata: {
    titleChanged: boolean
    descriptionChanged: boolean
    categoryChanged: boolean
    oldTitle?: string
    newTitle?: string
    oldDescription?: string
    newDescription?: string
    oldCategory?: string
    newCategory?: string
  }
  totalSlides: {
    local: number
    server: number
    difference: number
  }
}

export interface BrochureDifferenceSummary {
  hasChanges: boolean
  differences: BrochureDifference
  userFriendlyMessage: string
}

export class BrochureComparisonService {
  /**
   * Compare local brochure data with server brochure sync data
   */
  static compareBrochures(
    local: BrochureData,
    server: BrochureSyncData
  ): BrochureDifferenceSummary {
    const differences: BrochureDifference = {
      slides: {
        added: [],
        removed: [],
        modified: [],
        addedCount: 0,
        removedCount: 0,
        modifiedCount: 0
      },
      groups: {
        added: [],
        removed: [],
        modified: [],
        addedCount: 0,
        removedCount: 0,
        modifiedCount: 0
      },
      metadata: {
        titleChanged: false,
        descriptionChanged: false,
        categoryChanged: false
      },
      totalSlides: {
        local: local.totalSlides,
        server: server.totalSlides,
        difference: server.totalSlides - local.totalSlides
      }
    }

    // Compare slides
    const localSlideMap = new Map<string, BrochureSlide>()
    local.slides.forEach(slide => {
      localSlideMap.set(slide.id, slide)
    })

    const serverSlideMap = new Map<string, BrochureSlide>()
    server.slides.forEach(slide => {
      serverSlideMap.set(slide.id, slide)
    })

    // Find added slides (in server but not in local)
    server.slides.forEach(serverSlide => {
      if (!localSlideMap.has(serverSlide.id)) {
        differences.slides.added.push(serverSlide)
        differences.slides.addedCount++
      } else {
        // Check if modified
        const localSlide = localSlideMap.get(serverSlide.id)!
        if (this.isSlideModified(localSlide, serverSlide)) {
          differences.slides.modified.push({ local: localSlide, server: serverSlide })
          differences.slides.modifiedCount++
        }
      }
    })

    // Find removed slides (in local but not in server)
    local.slides.forEach(localSlide => {
      if (!serverSlideMap.has(localSlide.id)) {
        differences.slides.removed.push(localSlide)
        differences.slides.removedCount++
      }
    })

    // Compare groups
    const localGroupMap = new Map<string, SlideGroup>()
    local.groups.forEach(group => {
      localGroupMap.set(group.id, group)
    })

    const serverGroupMap = new Map<string, SlideGroup>()
    server.groups.forEach(group => {
      serverGroupMap.set(group.id, group)
    })

    // Find added groups (in server but not in local)
    server.groups.forEach(serverGroup => {
      if (!localGroupMap.has(serverGroup.id)) {
        differences.groups.added.push(serverGroup)
        differences.groups.addedCount++
      } else {
        // Check if modified
        const localGroup = localGroupMap.get(serverGroup.id)!
        if (this.isGroupModified(localGroup, serverGroup)) {
          differences.groups.modified.push({ local: localGroup, server: serverGroup })
          differences.groups.modifiedCount++
        }
      }
    })

    // Find removed groups (in local but not in server)
    local.groups.forEach(localGroup => {
      if (!serverGroupMap.has(localGroup.id)) {
        differences.groups.removed.push(localGroup)
        differences.groups.removedCount++
      }
    })

    // Compare metadata
    if (local.title !== server.brochureTitle) {
      differences.metadata.titleChanged = true
      differences.metadata.oldTitle = local.title
      differences.metadata.newTitle = server.brochureTitle
    }

    if (local.description !== undefined && server.brochureTitle !== local.title) {
      // Description comparison would need to be added to BrochureSyncData
      // For now, we'll skip this
    }

    // Check if there are any changes
    const hasChanges =
      differences.slides.addedCount > 0 ||
      differences.slides.removedCount > 0 ||
      differences.slides.modifiedCount > 0 ||
      differences.groups.addedCount > 0 ||
      differences.groups.removedCount > 0 ||
      differences.groups.modifiedCount > 0 ||
      differences.metadata.titleChanged ||
      differences.metadata.descriptionChanged ||
      differences.metadata.categoryChanged ||
      differences.totalSlides.difference !== 0

    // Generate user-friendly message
    const userFriendlyMessage = this.generateUserFriendlyMessage(differences)

    return {
      hasChanges,
      differences,
      userFriendlyMessage
    }
  }

  /**
   * Check if a slide has been modified
   */
  private static isSlideModified(local: BrochureSlide, server: BrochureSlide): boolean {
    return (
      local.title !== server.title ||
      local.order !== server.order ||
      JSON.stringify(local.groupIds || []) !== JSON.stringify(server.groupIds || [])
    )
  }

  /**
   * Check if a group has been modified
   */
  private static isGroupModified(local: SlideGroup, server: SlideGroup): boolean {
    return (
      local.name !== server.name ||
      local.color !== server.color ||
      JSON.stringify(local.slideIds.sort()) !== JSON.stringify(server.slideIds.sort())
    )
  }

  /**
   * Generate user-friendly message describing the differences
   */
  private static generateUserFriendlyMessage(differences: BrochureDifference): string {
    const parts: string[] = []

    // Slides changes
    if (differences.slides.addedCount > 0) {
      parts.push(`${differences.slides.addedCount} new slide${differences.slides.addedCount !== 1 ? 's' : ''} added`)
    }
    if (differences.slides.removedCount > 0) {
      parts.push(`${differences.slides.removedCount} slide${differences.slides.removedCount !== 1 ? 's' : ''} removed`)
    }
    if (differences.slides.modifiedCount > 0) {
      parts.push(`${differences.slides.modifiedCount} slide${differences.slides.modifiedCount !== 1 ? 's' : ''} modified`)
    }

    // Groups changes
    if (differences.groups.addedCount > 0) {
      parts.push(`${differences.groups.addedCount} new group${differences.groups.addedCount !== 1 ? 's' : ''} added`)
    }
    if (differences.groups.removedCount > 0) {
      parts.push(`${differences.groups.removedCount} group${differences.groups.removedCount !== 1 ? 's' : ''} removed`)
    }
    if (differences.groups.modifiedCount > 0) {
      parts.push(`${differences.groups.modifiedCount} group${differences.groups.modifiedCount !== 1 ? 's' : ''} modified`)
    }

    // Metadata changes
    if (differences.metadata.titleChanged) {
      parts.push(`Title changed from "${differences.metadata.oldTitle}" to "${differences.metadata.newTitle}"`)
    }

    // Total slides difference
    if (differences.totalSlides.difference !== 0) {
      if (differences.totalSlides.difference > 0) {
        parts.push(`${differences.totalSlides.difference} more slide${differences.totalSlides.difference !== 1 ? 's' : ''} in total`)
      } else {
        parts.push(`${Math.abs(differences.totalSlides.difference)} fewer slide${Math.abs(differences.totalSlides.difference) !== 1 ? 's' : ''} in total`)
      }
    }

    if (parts.length === 0) {
      return 'No changes detected'
    }

    return parts.join(', ')
  }

  /**
   * Format differences for display in prompt
   */
  static formatDifferencesForDisplay(differences: BrochureDifference): string[] {
    const lines: string[] = []

    // Slides section
    if (differences.slides.addedCount > 0 || differences.slides.removedCount > 0 || differences.slides.modifiedCount > 0) {
      lines.push('Slides:')
      if (differences.slides.addedCount > 0) {
        lines.push(`  • ${differences.slides.addedCount} new slide${differences.slides.addedCount !== 1 ? 's' : ''} added`)
        differences.slides.added.slice(0, 3).forEach(slide => {
          lines.push(`    - ${slide.title}`)
        })
        if (differences.slides.addedCount > 3) {
          lines.push(`    ... and ${differences.slides.addedCount - 3} more`)
        }
      }
      if (differences.slides.removedCount > 0) {
        lines.push(`  • ${differences.slides.removedCount} slide${differences.slides.removedCount !== 1 ? 's' : ''} removed`)
        differences.slides.removed.slice(0, 3).forEach(slide => {
          lines.push(`    - ${slide.title}`)
        })
        if (differences.slides.removedCount > 3) {
          lines.push(`    ... and ${differences.slides.removedCount - 3} more`)
        }
      }
      if (differences.slides.modifiedCount > 0) {
        lines.push(`  • ${differences.slides.modifiedCount} slide${differences.slides.modifiedCount !== 1 ? 's' : ''} modified`)
      }
    }

    // Groups section
    if (differences.groups.addedCount > 0 || differences.groups.removedCount > 0 || differences.groups.modifiedCount > 0) {
      lines.push('Groups:')
      if (differences.groups.addedCount > 0) {
        lines.push(`  • ${differences.groups.addedCount} new group${differences.groups.addedCount !== 1 ? 's' : ''} added`)
        differences.groups.added.slice(0, 3).forEach(group => {
          lines.push(`    - ${group.name}`)
        })
        if (differences.groups.addedCount > 3) {
          lines.push(`    ... and ${differences.groups.addedCount - 3} more`)
        }
      }
      if (differences.groups.removedCount > 0) {
        lines.push(`  • ${differences.groups.removedCount} group${differences.groups.removedCount !== 1 ? 's' : ''} removed`)
        differences.groups.removed.slice(0, 3).forEach(group => {
          lines.push(`    - ${group.name}`)
        })
        if (differences.groups.removedCount > 3) {
          lines.push(`    ... and ${differences.groups.removedCount - 3} more`)
        }
      }
      if (differences.groups.modifiedCount > 0) {
        lines.push(`  • ${differences.groups.modifiedCount} group${differences.groups.modifiedCount !== 1 ? 's' : ''} modified`)
      }
    }

    // Metadata section
    if (differences.metadata.titleChanged || differences.metadata.descriptionChanged || differences.metadata.categoryChanged) {
      lines.push('Metadata:')
      if (differences.metadata.titleChanged) {
        lines.push(`  • Title: "${differences.metadata.oldTitle}" → "${differences.metadata.newTitle}"`)
      }
      if (differences.metadata.descriptionChanged) {
        lines.push(`  • Description updated`)
      }
      if (differences.metadata.categoryChanged) {
        lines.push(`  • Category: "${differences.metadata.oldCategory}" → "${differences.metadata.newCategory}"`)
      }
    }

    return lines
  }
}

