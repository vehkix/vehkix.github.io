export type AdminSection = 'overview' | 'users' | 'vehicles' | 'deletion-requests' | 'form' | 'tile' | 'highlight' | 'details' | 'share'

export interface AdminAccount {
	id: string
	username: string
	email: string | null
	vehicleCount: number
}