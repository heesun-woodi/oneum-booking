import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local manually
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking message_templates table...\n');

try {
  const { data, error, count } = await supabase
    .from('message_templates')
    .select('*', { count: 'exact', head: false });
  
  if (error) {
    console.log('❌ Error:', error.message);
    console.log('Code:', error.code);
    console.log('\n💡 Table does NOT exist or RLS blocks access');
  } else {
    console.log('✅ Table EXISTS!');
    console.log(`📊 Total templates: ${count}`);
    console.log('\n📝 Sample data:');
    console.log(data?.slice(0, 3));
  }
} catch (e) {
  console.log('❌ Exception:', e.message);
}
