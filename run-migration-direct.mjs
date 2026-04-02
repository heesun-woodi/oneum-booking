#!/usr/bin/env node
import { readFileSync } from 'fs';
import postgres from 'postgres';

console.log('🚀 Phase 6.5 Migration - Direct Execution\n');

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

// Supabase connection string
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.log('❌ Missing Supabase credentials in .env.local\n');
  console.log('📋 Please copy and run this SQL manually:');
  console.log('   File: phase65-migration-combined.sql');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.log('❌ Invalid Supabase URL\n');
  process.exit(1);
}

console.log(`📍 Project: ${projectRef}`);
console.log(`🔗 URL: ${supabaseUrl}\n`);

// Supabase Direct PostgreSQL Connection
// Format: postgres://postgres:[password]@db.[ref].supabase.co:5432/postgres
console.log('⚠️  This script requires database password');
console.log('   Supabase doesn\'t expose direct DB password via API\n');
console.log('📋 Alternative: Use Supabase Dashboard SQL Editor\n');
console.log('Steps:');
console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql');
console.log('2. Open SQL Editor (New Query)');
console.log('3. Copy and paste contents of: phase65-migration-combined.sql');
console.log('4. Click "Run"\n');
console.log('✨ File location: ./phase65-migration-combined.sql');
console.log('\nFile preview:');
console.log('─'.repeat(60));
const sql = readFileSync('phase65-migration-combined.sql', 'utf8');
console.log(sql.split('\n').slice(0, 30).join('\n'));
console.log('─'.repeat(60));
console.log(`... (${sql.split('\n').length} lines total)\n`);
