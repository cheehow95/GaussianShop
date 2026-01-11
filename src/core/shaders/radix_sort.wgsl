// GPU Radix Sort - Compute Shader
// High-performance parallel sorting for Gaussian depth ordering
// Based on parallel radix sort algorithm for WebGPU

// Constants for radix sort
const RADIX_BITS: u32 = 4u;
const RADIX_SIZE: u32 = 16u; // 2^4
const WORKGROUP_SIZE: u32 = 256u;

// Uniforms
struct SortUniforms {
    count: u32,
    pass: u32,       // Current radix pass (0-7 for 32-bit keys)
    _padding: vec2<u32>,
}

@group(0) @binding(0) var<uniform> uniforms: SortUniforms;
@group(0) @binding(1) var<storage, read> keys_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> keys_out: array<u32>;
@group(0) @binding(3) var<storage, read> values_in: array<u32>;
@group(0) @binding(4) var<storage, read_write> values_out: array<u32>;
@group(0) @binding(5) var<storage, read_write> histogram: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> prefix_sums: array<u32>;

// Shared memory for local histogram
var<workgroup> local_histogram: array<atomic<u32>, RADIX_SIZE>;
var<workgroup> local_prefix: array<u32, RADIX_SIZE>;
var<workgroup> local_keys: array<u32, WORKGROUP_SIZE>;
var<workgroup> local_values: array<u32, WORKGROUP_SIZE>;

// Extract digit from key at current pass
fn extract_digit(key: u32, pass: u32) -> u32 {
    return (key >> (pass * RADIX_BITS)) & (RADIX_SIZE - 1u);
}

// Phase 1: Build global histogram
@compute @workgroup_size(256)
fn build_histogram(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let idx = global_id.x;
    let lid = local_id.x;

    // Initialize local histogram
    if (lid < RADIX_SIZE) {
        atomicStore(&local_histogram[lid], 0u);
    }
    workgroupBarrier();

    // Count digits in this workgroup
    if (idx < uniforms.count) {
        let key = keys_in[idx];
        let digit = extract_digit(key, uniforms.pass);
        atomicAdd(&local_histogram[digit], 1u);
    }
    workgroupBarrier();

    // Add local histogram to global histogram
    if (lid < RADIX_SIZE) {
        let local_count = atomicLoad(&local_histogram[lid]);
        if (local_count > 0u) {
            atomicAdd(&histogram[lid], local_count);
        }
    }
}

// Phase 2: Prefix sum on histogram (single workgroup)
@compute @workgroup_size(16)
fn prefix_sum(
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let lid = local_id.x;
    
    // Load histogram value
    var value = 0u;
    if (lid < RADIX_SIZE) {
        value = atomicLoad(&histogram[lid]);
        local_prefix[lid] = value;
    }
    workgroupBarrier();

    // Exclusive prefix sum using Hillis-Steele algorithm
    for (var offset = 1u; offset < RADIX_SIZE; offset *= 2u) {
        var temp = 0u;
        if (lid >= offset) {
            temp = local_prefix[lid - offset];
        }
        workgroupBarrier();
        if (lid >= offset) {
            local_prefix[lid] += temp;
        }
        workgroupBarrier();
    }

    // Convert inclusive to exclusive prefix sum
    if (lid < RADIX_SIZE) {
        if (lid == 0u) {
            prefix_sums[lid] = 0u;
        } else {
            prefix_sums[lid] = local_prefix[lid - 1u];
        }
    }
}

// Phase 3: Scatter elements to sorted positions
@compute @workgroup_size(256)
fn scatter(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>,
) {
    let idx = global_id.x;
    let lid = local_id.x;
    let wg = wg_id.x;

    // Initialize local histogram for this workgroup
    if (lid < RADIX_SIZE) {
        atomicStore(&local_histogram[lid], 0u);
    }
    workgroupBarrier();

    // Load key and value
    var key = 0xFFFFFFFFu;
    var value = 0u;
    var digit = 0u;
    
    if (idx < uniforms.count) {
        key = keys_in[idx];
        value = values_in[idx];
        digit = extract_digit(key, uniforms.pass);
    }

    // Store in local memory
    local_keys[lid] = key;
    local_values[lid] = value;
    workgroupBarrier();

    // Count digits before this element in local workgroup
    var local_offset = 0u;
    for (var i = 0u; i < lid; i++) {
        if (idx < uniforms.count && i < uniforms.count - wg * WORKGROUP_SIZE) {
            let other_digit = extract_digit(local_keys[i], uniforms.pass);
            if (other_digit == digit) {
                local_offset += 1u;
            }
        }
    }

    // Get global offset from prefix sums
    if (idx < uniforms.count) {
        let global_offset = prefix_sums[digit];
        
        // Calculate workgroup offset for this digit
        var wg_digit_count = 0u;
        for (var w = 0u; w < wg; w++) {
            // This would need per-workgroup histogram in a full implementation
            // For now, use atomics
        }
        
        // Write to output
        let out_idx = atomicAdd(&histogram[digit], 1u);
        if (out_idx < uniforms.count) {
            keys_out[out_idx] = key;
            values_out[out_idx] = value;
        }
    }
}

// Simple depth key generation from camera distance
@compute @workgroup_size(256)
fn generate_depth_keys(
    @builtin(global_invocation_id) global_id: vec3<u32>,
) {
    let idx = global_id.x;
    
    if (idx >= uniforms.count) {
        return;
    }

    // Position data would come from a separate binding
    // For now, this is a placeholder that would be connected to the actual Gaussian positions
}
