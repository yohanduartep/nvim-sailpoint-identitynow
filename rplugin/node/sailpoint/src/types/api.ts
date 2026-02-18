// Type definitions for SailPoint IdentityNow API responses

export interface IdentityNowResource {
id: string;
name: string;
[key: string]: unknown;
}

export interface Identity extends IdentityNowResource {
displayName?: string;
email?: string;
firstName?: string;
lastName?: string;
uid?: string;
}

export interface Role extends IdentityNowResource {
description?: string;
owner?: { id: string; name: string };
accessProfiles?: Array<{ id: string; name: string }>;
}

export interface AccessProfile extends IdentityNowResource {
description?: string;
source?: { id: string; name: string };
entitlements?: Array<{ id: string; name: string }>;
}

export interface Source extends IdentityNowResource {
description?: string;
type?: string;
connectorAttributes?: Record<string, unknown>;
authoritative?: boolean;
}

export interface Entitlement extends IdentityNowResource {
description?: string;
source?: { id: string; name: string };
privileged?: boolean;
attribute?: string;
value?: string;
}

export interface Account extends IdentityNowResource {
identityId?: string;
sourceId?: string;
source_display_name?: string;
cloudLifecycleState?: string;
nativeIdentity?: string;
disabled?: boolean;
}

export interface SearchAttribute extends IdentityNowResource {
attribute?: string;
key?: string;
displayName?: string;
}

export interface Tenant extends IdentityNowResource {
url?: string;
version?: string;
isActive?: boolean;
}

export interface AccountSource {
id: string;
name: string;
count?: number;
}

export type ResourceItem = 
| Identity 
| Role 
| AccessProfile 
| Source 
| Entitlement 
| Account 
| SearchAttribute 
| Tenant;

export interface FetchResponse<T = ResourceItem> {
items: T[];
totalCount?: number;
}

export interface ResourceMetadata {
totalCount?: number;
count?: number;
}

export interface APIError {
message?: string;
messages?: Array<{ text: string; key?: string }>;
detailCode?: string;
trackingId?: string;
}
