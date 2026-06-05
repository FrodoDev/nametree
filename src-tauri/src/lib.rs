use serde::Serialize;

#[derive(Serialize)]
struct NametreeDocument {
    id: String,
    title: String,
    slogan: String,
    nodes: Vec<TreeNode>,
    tree_edges: Vec<TreeEdge>,
    reference_links: Vec<ReferenceLink>,
}

#[derive(Serialize)]
struct TreeNode {
    id: String,
    title: String,
    note: String,
    kind: NodeKind,
    color: String,
    x: i32,
    y: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
enum NodeKind {
    SeedRoot,
    MainTrunk,
    MainRoot,
    Branch,
    Leaf,
    RootBranch,
}

#[derive(Serialize)]
struct TreeEdge {
    parent_id: String,
    child_id: String,
}

#[derive(Serialize)]
struct ReferenceLink {
    id: String,
    source_id: String,
    target_id: String,
    direction: LinkDirection,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
enum LinkDirection {
    OneWay,
    TwoWay,
}

#[tauri::command]
fn load_sample_tree() -> NametreeDocument {
    NametreeDocument {
        id: "default-tree".into(),
        title: "Nametree".into(),
        slogan: "Name it to own it".into(),
        nodes: vec![TreeNode {
            id: "seed-root".into(),
            title: "根节点".into(),
            note: "从这里开始。选择这个节点后，可以生长出主干或主根。".into(),
            kind: NodeKind::SeedRoot,
            color: "#7b6b55".into(),
            x: 450,
            y: 350,
        }],
        tree_edges: vec![],
        reference_links: vec![],
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_sample_tree])
        .run(tauri::generate_context!())
        .expect("error while running nametree application");
}
