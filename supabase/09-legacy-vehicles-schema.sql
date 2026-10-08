-- Legacy public vehicle table schema. The private collection uses user_vehicles.

create table if not exists public.vehicles (
  id text primary key,
  vehicle_number text,
  name text,
  model text,
  company text,
  year integer,
  taken_date date,
  last_service_date date,
  last_service_km integer,
  next_service_date date,
  next_service_km integer,
  last_pucc_date date,
  next_pucc_date date,
  insurance_taken_date date,
  insurance_next_renewal_date date,
  uploaded_by text,
  uploaded_date date,
  images text[]
);