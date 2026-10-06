export type AdminSection = 'overview' | 'users' | 'vehicles' | 'deletion-requests' | 'form' | 'details' | 'share'

export interface AdminAccount {
	id: string
	username: string
	email: string | null
	vehicleCount: number
}