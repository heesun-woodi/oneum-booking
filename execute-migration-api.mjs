#!/usr/bin/env node
import { readFileSync } from 'fs';

console.log('🚀 Phase 6.5 Migration - Supabase Management API\n');

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!supabaseUrl || !serviceRoleKey || !projectRef) {
  console.log('❌ Missing Supabase credentials\n');
  process.exit(1);
}

console.log(`📍 Project: ${projectRef}`);
console.log(`🔗 URL: ${supabaseUrl}\n`);

// Read SQL file
const sql = readFileSync('phase65-migration-combined.sql', 'utf8');

console.log('📋 Attempting to execute SQL via Supabase REST API...\n');

// Supabase SQL execution via REST API (PostgREST doesn't support raw SQL execution)
// We need to use the database directly or Management API

console.log('⚠️  Supabase REST API does not support executing raw DDL SQL');
console.log('   (ALTER TABLE, CREATE FUNCTION, etc. need direct DB access)\n');
console.log('✅ SQL file is ready: phase65-migration-combined.sql\n');
console.log('📋 Please execute manually in Supabase Dashboard:\n');
console.log('Steps:');
console.log('1. Open: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
console.log('2. Copy entire contents of: phase65-migration-combined.sql');
console.log('3. Paste into SQL Editor');
console.log('4. Click "Run" button\n');
console.log('File size: ' + sql.split('\n').length + ' lines, ' + (sql.length / 1024).toFixed(1) + ' KB');
console.log('\n🔍 Quick verification after running:');
console.log('  - Table Editor → bookings → Check columns: payment_method, user_id, payment_status');
console.log('  - Database → Functions → Check: create_booking_with_prepaid, cancel_booking_restore_prepaid\n');
