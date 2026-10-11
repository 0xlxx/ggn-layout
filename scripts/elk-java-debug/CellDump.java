import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator;
import org.eclipse.elk.alg.common.nodespacing.internal.NodeContext;
import org.eclipse.elk.alg.common.nodespacing.internal.PortContext;
import org.eclipse.elk.alg.common.nodespacing.internal.algorithm.*;
import org.eclipse.elk.alg.common.nodespacing.cellsystem.*;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LGraphAdapters;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.options.PortSide;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.adapters.GraphAdapters.GraphAdapter;
import org.eclipse.elk.core.util.adapters.GraphAdapters.NodeAdapter;
import org.eclipse.elk.graph.ElkNode;

/** 完整 cell 树 min + contribution flags dump. */
public class CellDump {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph && processor.getClass().getSimpleName().contains("LabelAndNodeSize")) {
                    dump((LGraph) graph);
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
    static void dump(LGraph g) {
        String parentName = g.getParentNode() != null ? g.getParentNode().getDesignation() : "ROOT";
        System.out.println("=== graph parent=" + parentName);
        GraphAdapter<LGraph> adapter = LGraphAdapters.adapt(g, true, true, node -> node.getType() == NodeType.NORMAL);
        for (NodeAdapter<?> na : adapter.getNodes()) {
            NodeContext ctx = new NodeContext(adapter, na);
            PortContextCreator.createPortContexts(ctx, false);
            NodeLabelCellCreator.createNodeLabelCells(ctx, false, true);
            InsidePortLabelCellCreator.createInsidePortLabelCells(ctx);
            NodeLabelAndSizeUtilities.setupMinimumClientAreaSize(ctx);
            NodeLabelAndSizeUtilities.setupNodePaddingForPortsWithOffset(ctx);
            HorizontalPortPlacementSizeCalculator.calculateHorizontalPortPlacementSize(ctx);
            VerticalPortPlacementSizeCalculator.calculateVerticalPortPlacementSize(ctx);
            CellSystemConfigurator.configureCellSystemSizeContributions(ctx);
            StringBuilder lbl = new StringBuilder();
            for (var l : na.getLabels()) lbl.append(l.getText()).append('|');
            System.out.println("NODE size=" + na.getSize() + " label=" + lbl.toString());
            System.out.println("nodeContainer min=(" + ctx.nodeContainer.getMinimumWidth() + "," + ctx.nodeContainer.getMinimumHeight() + ") pad=" + ctx.nodeContainer.getPadding());
            AtomicCell nc = ctx.insidePortLabelCells.get(PortSide.NORTH);
            System.out.println("  N cell content=" + nc.getMinimumContentAreaSize() + " pad=" + nc.getPadding() + " contribW=" + nc.isContributingToMinimumWidth() + " contribH=" + nc.isContributingToMinimumHeight());
            AtomicCell ec = ctx.insidePortLabelCells.get(PortSide.EAST);
            System.out.println("  E cell content=" + ec.getMinimumContentAreaSize() + " pad=" + ec.getPadding() + " contribW=" + ec.isContributingToMinimumWidth() + " contribH=" + ec.isContributingToMinimumHeight());
            System.out.println("  middleRow min=(" + ctx.nodeContainerMiddleRow.getMinimumWidth() + "," + ctx.nodeContainerMiddleRow.getMinimumHeight() + ") contribW=" + ctx.nodeContainerMiddleRow.isContributingToMinimumWidth() + " contribH=" + ctx.nodeContainerMiddleRow.isContributingToMinimumHeight());
            System.out.println("  grid min=(" + ctx.insideNodeLabelContainer.getMinimumWidth() + "," + ctx.insideNodeLabelContainer.getMinimumHeight() + ") contribW=" + ctx.insideNodeLabelContainer.isContributingToMinimumWidth() + " contribH=" + ctx.insideNodeLabelContainer.isContributingToMinimumHeight());
            System.out.println("  constraints=" + ctx.sizeConstraints + " options=" + ctx.sizeOptions + " fixed=" + NodeLabelAndSizeUtilities.areSizeConstraintsFixed(ctx) + " minNode=" + NodeLabelAndSizeUtilities.getMinimumNodeSize(ctx));
        }
    }
}
