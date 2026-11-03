import { createClient } from '@supabase/supabase-js'

// ค่าเริ่มต้นชี้ไปยังโปรเจกต์ Supabase ของฝ่ายการศึกษา
// สามารถOverrideได้ด้วยไฟล์ .env (ดู .env.example) โดยไม่ต้องแก้โค้ด
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://ccflyjycsfwnpfgkhpoy.supabase.co'
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZmx5anljc2Z3bnBmZ2tocG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MTA0NjQsImV4cCI6MjEwOTI4NjQ2NH0.mfMBLyV2suzeFUQd8vQlKKb7sdrab0wgd2JzjGBp3A8'

export const supabase = createClient(supabaseUrl, supabaseKey)
