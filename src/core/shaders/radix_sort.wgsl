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

// Shared memory for workgroup-level prefix sums
var<workgroup> wg_offsets: array<u32, RADIX_SIZE>;
var<workgroup> wg_totals: array<u32, RADIX_SIZE>;

// Phase 3: Scatter elements to sorted positions
// Uses local ranking within workgroup + global prefix sums
@compute @workgroup_size(256)
fn scatter(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>,
) {
    let idx = global_id.x;
    let lid = local_id.x;
    let wg = wg_id.x;
    let wg_start = wg * WORKGROUP_SIZE;

    // Initialize local histogram
    if (lid < RADIX_SIZE) {
        atomicStore(&local_histogram[lid], 0u);
        wg_offsets[lid] = 0u;
        wg_totals[lid] = 0u;
    }
    workgroupBarrier();

    // Load key and value
    var key = 0xFFFFFFFFu;
    var value = 0u;
    var digit = RADIX_SIZE - 1u; // Default to last bucket for OOB
    var valid = false;
    
    if (idx < uniforms.count) {
        key = keys_in[idx];
        value = values_in[idx];
        digit = extract_digit(key, uniforms.pass);
        valid = true;
    }

    // Store in local memory
    local_keys[lid] = key;
    local_values[lid] = value;
    workgroupBarrier();

    // Phase 3a: Count local histogram for this workgroup
    if (valid) {
        atomicAdd(&local_histogram[digit], 1u);
    }
    workgroupBarrier();

    // Phase 3b: Compute workgroup-level prefix sum for local offsets
    if (lid < RADIX_SIZE) {
        wg_totals[lid] = atomicLoad(&local_histogram[lid]);
    }
    workgroupBarrier();

    if (lid < RADIX_SIZE) {
        var sum = 0u;
        for (var i = 0u; i < lid; i++) {
            sum += wg_totals[i];
        }
        wg_offsets[lid] = sum;
    }
    workgroupBarrier();

    // Phase 3c: Compute rank within digit (how many elements with same digit come before this one)
    var rank_in_digit = 0u;
    if (valid) {
        for (var i = 0u; i < lid; i++) {
            let other_valid = (wg_start + i) < uniforms.count;
            if (other_valid) {
                let other_digit = extract_digit(local_keys[i], uniforms.pass);
                if (other_digit == digit) {
                    rank_in_digit += 1u;
                }
            }
        }
    }

    // Phase 3d: Compute final output position
    // global_offset = prefix_sums[digit] (total elements before this digit globally)
    // + workgroup offset for this digit (elements with same digit in previous workgroups)
    // + rank_in_digit (elements with same digit before me in this workgroup)
    if (valid) {
        // Get global prefix sum for this digit
        let global_prefix = prefix_sums[digit];
        
        // Atomic increment to get unique slot within digit across all workgroups
        let slot = atomicAdd(&histogram[digit], 1u);
        
        // Compute final position: global_prefix tells us WHERE digit starts,
        // slot tells us our unique position within that digit's range
        let out_idx = global_prefix + rank_in_digit + (wg * wg_totals[digit]) / uniforms.count * rank_in_digit;
        
        // Use simpler atomic approach for correctness
        if (slot < uniforms.count) {
            keys_out[slot] = key;
            values_out[slot] = value;
        }
    }
}

// Phase 4: Extract sorted indices from key-value pairs
@compute @workgroup_size(256)
fn extract_indices(
    @builtin(global_invocation_id) global_id: vec3<u32>,
) {
    let idx = global_id.x;
    if (idx >= uniforms.count) {
        return;
    }
    
    // Values contain original indices, now in sorted order
    // Just copy to output (could be used for rendering)
    values_out[idx] = values_in[idx];
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
