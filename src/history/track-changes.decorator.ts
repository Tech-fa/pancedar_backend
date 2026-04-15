import 'reflect-metadata';

const TRACK_CHANGES_METADATA_KEY = 'changelog:track_changes';
const EXCLUDE_CHANGES_FIELDS_METADATA_KEY = 'changelog:excluded_fields';

/**
 * Decorator to mark an entity class for changelog tracking
 */
export function TrackChanges(): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(TRACK_CHANGES_METADATA_KEY, true, target);
    
    // If no specific fields are marked for tracking, we'll track all fields
    if (!Reflect.hasMetadata(EXCLUDE_CHANGES_FIELDS_METADATA_KEY, target)) {
      Reflect.defineMetadata(EXCLUDE_CHANGES_FIELDS_METADATA_KEY, [], target);
    }
  };
}

/**
 * Decorator to mark specific fields for tracking in an entity
 */
export function ExcludeField(): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const fieldsToExclude: (string | symbol)[] = Reflect.getMetadata(
        EXCLUDE_CHANGES_FIELDS_METADATA_KEY,
      target.constructor,
    ) || [];
    
    fieldsToExclude.push(propertyKey);
    
    Reflect.defineMetadata(
        EXCLUDE_CHANGES_FIELDS_METADATA_KEY,
      fieldsToExclude,
      target.constructor,
    );
  };
}

/**
 * Utility functions to check if an entity or field should be tracked
 */
export function shouldTrackEntity(entityClass: any): boolean {
  return Reflect.getMetadata(TRACK_CHANGES_METADATA_KEY, entityClass) === true;
}

export function excludedFields(entityClass: any): (string | symbol)[] {
  return Reflect.getMetadata(EXCLUDE_CHANGES_FIELDS_METADATA_KEY, entityClass) || [];
}
 