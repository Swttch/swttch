import type { TableMetadataSource } from './TableMetadataSource';
import { TableMetadataCollection } from './system/TableMetadata.collection';

/**
 * Where a collection takes its ids and version bookkeeping from unless told
 * otherwise.
 *
 * In a module of its own so that the collections which need them can reach the
 * collection that stores them without that one importing them back.
 */
export function defaultTableMetadata(): TableMetadataSource {
  return new TableMetadataCollection();
}
