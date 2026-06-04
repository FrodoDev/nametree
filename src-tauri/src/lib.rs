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
enum NodeKind {
    RootInput,
    Trunk,
    BranchOutput,
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
enum LinkDirection {
    OneWay,
    TwoWay,
}

#[tauri::command]
fn load_sample_tree() -> NametreeDocument {
    NametreeDocument {
        id: "sample-tree".into(),
        title: "学习 Rust".into(),
        slogan: "Name it to own it.".into(),
        nodes: vec![
            TreeNode {
                id: "input-book".into(),
                title: "书籍".into(),
                note: "作为根部输入：Rust 程序设计语言、官方文档、示例代码。".into(),
                kind: NodeKind::RootInput,
                color: "#9a7b4f".into(),
                x: 260,
                y: 470,
            },
            TreeNode {
                id: "input-practice".into(),
                title: "练习".into(),
                note: "通过小项目和错误记录，把输入转化成真正理解。".into(),
                kind: NodeKind::RootInput,
                color: "#8b6f47".into(),
                x: 430,
                y: 520,
            },
            TreeNode {
                id: "ownership".into(),
                title: "所有权".into(),
                note: "Rust 的核心主干：所有权、借用、生命周期共同决定内存安全。".into(),
                kind: NodeKind::Trunk,
                color: "#668b4f".into(),
                x: 360,
                y: 310,
            },
            TreeNode {
                id: "borrow".into(),
                title: "借用".into(),
                note: "通过引用访问数据，同时避免数据竞争和悬垂引用。".into(),
                kind: NodeKind::BranchOutput,
                color: "#d9a441".into(),
                x: 190,
                y: 150,
            },
            TreeNode {
                id: "lifetime".into(),
                title: "生命周期".into(),
                note: "描述引用有效范围，是理解复杂借用关系的输出节点。".into(),
                kind: NodeKind::BranchOutput,
                color: "#d87f45".into(),
                x: 530,
                y: 150,
            },
        ],
        tree_edges: vec![
            TreeEdge {
                parent_id: "input-book".into(),
                child_id: "ownership".into(),
            },
            TreeEdge {
                parent_id: "input-practice".into(),
                child_id: "ownership".into(),
            },
            TreeEdge {
                parent_id: "ownership".into(),
                child_id: "borrow".into(),
            },
            TreeEdge {
                parent_id: "ownership".into(),
                child_id: "lifetime".into(),
            },
        ],
        reference_links: vec![
            ReferenceLink {
                id: "borrow-lifetime".into(),
                source_id: "borrow".into(),
                target_id: "lifetime".into(),
                direction: LinkDirection::TwoWay,
                label: "相互约束".into(),
            },
            ReferenceLink {
                id: "book-borrow".into(),
                source_id: "input-book".into(),
                target_id: "borrow".into(),
                direction: LinkDirection::OneWay,
                label: "提供材料".into(),
            },
        ],
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
