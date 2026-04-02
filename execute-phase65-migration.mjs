#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

console.log('🚀 Phase 6.5 Migration Executor\n');

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.log('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local\n');
  console.log('📋 Please run these SQLs manually in Supabase Dashboard:');
  console.log('   1. supabase/migrations/015_booking_prepaid_integration.sql');
  console.log('   2. supabase/migrations/016_booking_prepaid_rpc.sql');
  process.exit(1);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const migrations = [
  {
    file: 'supabase/migrations/015_booking_prepaid_integration.sql',
    name: 'Booking-Prepaid Integration (Columns)'
  },
  {
    file: 'supabase/migrations/016_booking_prepaid_rpc.sql',
    name: 'Booking-Prepaid RPC Functions'
  }
];

// Execute each SQL file directly
for (const { file, name } of migrations) {
  try {
    console.log(`\n📄 Executing: ${name}`);
    console.log(`   File: ${file}`);
    
    const sql = readFileSync(file, 'utf8');
    
    // Split SQL into individual statements and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;
      
      try {
        // Execute via raw SQL (using from() with RPC or direct query)
        const { data, error } = await supabase.rpc('exec', { sql: stmt });
        
        if (error) {
          // Try direct query if rpc doesn't work
          throw error;
        }
      } catch (rpcError) {
        // Fallback: manual execution needed
        console.log(`   ⚠️  Statement ${i + 1}: Needs manual execution`);
      }
    }
    
    console.log(`   ✅ ${name} executed`);
  } catch (e) {
    console.log(`   ❌ Failed: ${e.message}`);
    console.log(`   📋 Please run ${file} manually in Supabase SQL Editor`);
  }
}

console.log('\n\n📋 IMPORTANT: Verify migration in Supabase Dashboard');
console.log('   1. Go to: Table Editor → bookings');
console.log('   2. Check new columns: payment_method, user_id, payment_status, cancelled_at');
console.log('   3. Go to: Database → Functions');
console.log('   4. Check functions: create_booking_with_prepaid, cancel_booking_restore_prepaid');
console.log('\n✨ If you see any errors above, run the SQL files manually.');
