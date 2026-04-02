import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const migrations = [
  'supabase/migrations/015_booking_prepaid_integration.sql',
  'supabase/migrations/016_booking_prepaid_rpc.sql'
];

console.log('🚀 Running Phase 6.5 migrations\n');
console.log('⚠️  These migrations need to be run in Supabase Dashboard SQL Editor\n');

// Use service role key for admin access
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.log('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  console.log('\n📋 Manual execution required:');
  console.log('1. Go to: Supabase Dashboard → SQL Editor');
  console.log('2. Run these files in order:');
  migrations.forEach((file, i) => {
    console.log(`   ${i + 1}. ${file}`);
  });
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

// Execute migrations
for (const migrationFile of migrations) {
  try {
    console.log(`\n📄 Running: ${migrationFile}`);
    const sql = readFileSync(migrationFile, 'utf8');
    
    // Execute SQL directly (Service Role has full access)
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.log(`❌ Failed: ${error.message}`);
      console.log('\n📋 Manual execution required:');
      console.log('1. Go to: Supabase Dashboard → SQL Editor');
      console.log(`2. Copy & paste: ${migrationFile}`);
      console.log('3. Run it!');
    } else {
      console.log(`✅ Success!`);
    }
  } catch (e) {
    console.log(`❌ Exception: ${e.message}`);
    console.log('\n📋 Manual execution required:');
    console.log('1. Go to: Supabase Dashboard → SQL Editor');
    console.log(`2. Copy & paste: ${migrationFile}`);
    console.log('3. Run it!');
  }
}

console.log('\n✨ Migration script complete!');
console.log('\nIf any failed, you can manually run them in:');
console.log('https://supabase.com/dashboard → SQL Editor');
